const express = require('express');
const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const app = express();
const port = 3012;

// Store the latest QR code
let lastQR = '';

// Middleware to parse JSON bodies
app.use(express.json());

// Store for OTPs (in production, use a proper database)
const otpStore = new Map();

// Initialize WhatsApp client
const client = new Client();

// WhatsApp client event handlers
client.on('qr', async (qr) => {
    console.log('QR RECEIVED', qr);
    try {
        lastQR = await qrcode.toDataURL(qr);
    } catch (err) {
        console.error('Could not generate QR code:', err);
    }
});

client.on('ready', () => {
    console.log('WhatsApp Client is ready!');
    lastQR = '';
});

// Function to format Indian phone number
function formatIndianPhoneNumber(phoneNumber) {
    // Remove all non-numeric characters
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    // If number starts with '0', remove it
    if (cleaned.startsWith('0')) {
        cleaned = cleaned.substring(1);
    }
    
    // If number starts with '+91', remove it
    if (cleaned.startsWith('91')) {
        cleaned = cleaned.substring(2);
    }
    
    // Check if it's a valid 10-digit Indian mobile number
    if (cleaned.length !== 10) {
        throw new Error('Invalid phone number length. Please provide a 10-digit mobile number.');
    }
    
    // Add '91' prefix and WhatsApp suffix
    return `91${cleaned}@c.us`;
}

// Function to generate OTP
function generateOTP() {
    return Math.floor(1000 + Math.random() * 9000);
}

// Endpoint to get QR code
app.get('/qr', (req, res) => {
    if (lastQR) {
        res.send(`
            <html>
                <body style="display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                    <div style="text-align: center;">
                        <h1>Scan QR Code to Login</h1>
                        <img src="${lastQR}" alt="WhatsApp QR Code">
                        <p>Please scan this QR code with WhatsApp to authenticate the service</p>
                    </div>
                </body>
            </html>
        `);
    } else {
        res.send(`
            <html>
                <body style="display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                    <div style="text-align: center;">
                        <h1>No QR Code Available</h1>
                        <p>Client is either already authenticated or initializing</p>
                    </div>
                </body>
            </html>
        `);
    }
});

// API endpoint to send OTP
app.post('/send-otp', async (req, res) => {
    try {
        const { phoneNumber } = req.body;

        if (!phoneNumber) {
            return res.status(400).json({ 
                success: false, 
                message: 'Phone number is required' 
            });
        }

        // Format and validate phone number
        let formattedPhone;
        try {
            formattedPhone = formatIndianPhoneNumber(phoneNumber);
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        const otp = generateOTP();

        otpStore.set(formattedPhone, {
            otp,
            timestamp: Date.now()
        });

        // Send WhatsApp message
        const message = `Your CutTheQ login OTP: ${otp}`;
        await client.sendMessage(formattedPhone, message);

        res.json({
            success: true,
            message: 'OTP sent successfully'
        });

    } catch (error) {
        console.error('Error sending OTP:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send OTP'
        });
    }
});

// API endpoint to verify OTP
app.post('/verify-otp', (req, res) => {
    try {
        const { phoneNumber, otp } = req.body;

        if (!phoneNumber || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Phone number and OTP are required'
            });
        }

        // Format phone number for verification
        const formattedPhone = formatIndianPhoneNumber(phoneNumber);
        
        const storedData = otpStore.get(formattedPhone);

        if (!storedData) {
            return res.status(400).json({
                success: false,
                message: 'No OTP found for this number'
            });
        }

        if (storedData.otp === parseInt(otp)) {
            // Check if OTP is expired (15 minutes validity)
            if (Date.now() - storedData.timestamp > 15 * 60 * 1000) {
                otpStore.delete(formattedPhone);
                return res.status(400).json({
                    success: false,
                    message: 'OTP has expired'
                });
            }

            otpStore.delete(formattedPhone);

            return res.json({
                success: true,
                message: 'OTP verified successfully'
            });
        }

        res.status(400).json({
            success: false,
            message: 'Invalid OTP'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// Initialize WhatsApp client
client.initialize();

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});