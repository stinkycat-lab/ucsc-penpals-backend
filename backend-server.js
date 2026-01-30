// UCSC Penpals Backend Server
// Handles email verification, notifications, and data storage

const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Simple file-based database (use MongoDB/PostgreSQL for production scale)
const DB_FILE = './database.json';

function loadDB() {
    try {
        if (fs.existsSync(DB_FILE)) {
            return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading database:', e);
    }
    return {
        users: {},
        pendingCodes: {},
        messages: [],
        matches: {}
    };
}

function saveDB(db) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

let db = loadDB();

// Email configuration
const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

// Admin email for notifications
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const WEBSITE_URL = process.env.WEBSITE_URL || 'http://localhost:3000';

// Email templates
const emailTemplates = {
    verification: (code) => ({
        subject: 'Your Verification Code - UCSC Penpals',
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; background: #0a1929; color: #ffffff; border-radius: 8px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <img src="https://i.imgur.com/HeS0J6I.png" alt="Slug" style="width: 60px; height: auto; margin-bottom: 10px;">
                    <img src="https://i.imgur.com/TTnGAdD.jpeg" alt="UCSC Penpals" style="width: 80px; height: 80px; border-radius: 12px;">
                </div>
                <h1 style="color: #ffd54f; text-align: center; font-size: 24px; font-weight: 500;">Your Verification Code</h1>
                <p style="text-align: center; color: rgba(255,255,255,0.8);">Enter this code to verify your UCSC email:</p>
                <div style="background: #1a2332; padding: 20px; text-align: center; margin: 20px 0; border-radius: 4px; border: 1px solid #2a4a6f;">
                    <span style="font-size: 36px; font-family: monospace; letter-spacing: 8px; color: #ffd54f;">${code}</span>
                </div>
                <p style="text-align: center; color: rgba(255,255,255,0.6); font-size: 14px;">This code expires in 15 minutes.</p>
                <hr style="border: none; border-top: 1px solid #2a4a6f; margin: 20px 0;">
                <p style="text-align: center; color: rgba(255,255,255,0.5); font-size: 12px;">UCSC Penpals - Connect with fellow Banana Slugs, one letter at a time!</p>
            </div>
        `
    }),

    matchNotification: (partnerIntro) => ({
        subject: "You've Been Matched! - UCSC Penpals",
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; background: #0a1929; color: #ffffff; border-radius: 8px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <img src="https://i.imgur.com/HeS0J6I.png" alt="Slug" style="width: 60px; height: auto; margin-bottom: 10px;">
                    <img src="https://i.imgur.com/TTnGAdD.jpeg" alt="UCSC Penpals" style="width: 80px; height: 80px; border-radius: 12px;">
                </div>
                <h1 style="color: #ffd54f; text-align: center; font-size: 24px; font-weight: 500;">You've Been Matched!</h1>
                <p style="text-align: center; color: rgba(255,255,255,0.8);">Great news! You've been paired with a fellow Banana Slug.</p>
                <div style="background: #1a2332; padding: 20px; margin: 20px 0; border-radius: 4px; border: 1px solid #2a4a6f;">
                    <p style="color: #ffd54f; font-size: 14px; margin-bottom: 10px; letter-spacing: 1px;">Your Penpal's Introduction:</p>
                    <p style="color: rgba(255,255,255,0.9); line-height: 1.6; font-style: italic;">"${partnerIntro}"</p>
                </div>
                <div style="text-align: center; margin: 25px 0;">
                    <a href="${WEBSITE_URL}" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #2196f3 0%, #1565c0 100%); color: white; text-decoration: none; border-radius: 4px; font-weight: 500;">Write Your First Letter</a>
                </div>
                <p style="text-align: center; color: rgba(255,255,255,0.6); font-size: 14px;">Remember: Messages take 12 hours to deliver, just like real letters!</p>
                <hr style="border: none; border-top: 1px solid #2a4a6f; margin: 20px 0;">
                <p style="text-align: center; color: rgba(255,255,255,0.5); font-size: 12px;">UCSC Penpals - Connect with fellow Banana Slugs, one letter at a time!</p>
            </div>
        `
    }),

    messageDelivered: () => ({
        subject: 'You Have a New Letter! - UCSC Penpals',
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; background: #0a1929; color: #ffffff; border-radius: 8px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <img src="https://i.imgur.com/HeS0J6I.png" alt="Slug" style="width: 60px; height: auto; margin-bottom: 10px;">
                    <img src="https://i.imgur.com/TTnGAdD.jpeg" alt="UCSC Penpals" style="width: 80px; height: 80px; border-radius: 12px;">
                </div>
                <h1 style="color: #ffd54f; text-align: center; font-size: 24px; font-weight: 500;">You Have a New Letter!</h1>
                <p style="text-align: center; color: rgba(255,255,255,0.8);">Your penpal's message has arrived and is ready to read!</p>
                <div style="background: #1a2332; padding: 20px; margin: 20px 0; border-radius: 4px; border: 1px solid #2a4a6f; text-align: center;">
                    <p style="color: #ffd54f; font-size: 18px; margin: 0;">📬 A letter is waiting for you</p>
                </div>
                <div style="text-align: center; margin: 25px 0;">
                    <a href="${WEBSITE_URL}" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #2196f3 0%, #1565c0 100%); color: white; text-decoration: none; border-radius: 4px; font-weight: 500;">Read Your Letter</a>
                </div>
                <hr style="border: none; border-top: 1px solid #2a4a6f; margin: 20px 0;">
                <p style="text-align: center; color: rgba(255,255,255,0.5); font-size: 12px;">UCSC Penpals - Connect with fellow Banana Slugs, one letter at a time!</p>
            </div>
        `
    }),

    adminNewSignup: (email, intro) => ({
        subject: 'New User Signup - UCSC Penpals',
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; background: #0a1929; color: #ffffff; border-radius: 8px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <img src="https://i.imgur.com/HeS0J6I.png" alt="Slug" style="width: 60px; height: auto; margin-bottom: 10px;">
                    <img src="https://i.imgur.com/TTnGAdD.jpeg" alt="UCSC Penpals" style="width: 80px; height: 80px; border-radius: 12px;">
                </div>
                <h1 style="color: #ffd54f; text-align: center; font-size: 24px; font-weight: 500;">New User Waiting for Match</h1>
                <div style="background: #1a2332; padding: 20px; margin: 20px 0; border-radius: 4px; border: 1px solid #2a4a6f;">
                    <p style="color: #2196f3; font-size: 14px; margin-bottom: 5px; letter-spacing: 1px;">Email:</p>
                    <p style="color: rgba(255,255,255,0.9); margin-bottom: 15px;">${email}</p>
                    <p style="color: #ffd54f; font-size: 14px; margin-bottom: 5px; letter-spacing: 1px;">Introduction:</p>
                    <p style="color: rgba(255,255,255,0.9); line-height: 1.6; font-style: italic;">"${intro}"</p>
                </div>
                <div style="text-align: center; margin: 25px 0;">
                    <a href="${WEBSITE_URL}" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #2196f3 0%, #1565c0 100%); color: white; text-decoration: none; border-radius: 4px; font-weight: 500;">Go to Admin Panel</a>
                </div>
                <p style="text-align: center; color: rgba(255,255,255,0.6); font-size: 14px;">Log in to match this user with a penpal.</p>
            </div>
        `
    })
};

// Send email helper
async function sendEmail(to, template) {
    console.log(`Attempting to send email to: ${to}`);
    console.log(`Subject: ${template.subject}`);
    console.log(`Using EMAIL_USER: ${process.env.EMAIL_USER}`);
    
    try {
        const info = await transporter.sendMail({
            from: `"UCSC Penpals" <${process.env.EMAIL_USER}>`,
            to: to,
            subject: template.subject,
            html: template.html
        });
        console.log(`Email sent successfully to ${to}`);
        console.log(`Message ID: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error('==== EMAIL ERROR ====');
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error code:', error.code);
        console.error('Full error:', error);
        console.error('====================');
        return false;
    }
}

// Schedule message delivery notification
function scheduleDeliveryNotification(recipientEmail, deliveryTime) {
    const delay = deliveryTime - Date.now();
    
    if (delay > 0) {
        setTimeout(async () => {
            // Send the delivery notification email
            await sendEmail(recipientEmail, emailTemplates.messageDelivered());
            console.log(`Delivery notification sent to ${recipientEmail}`);
        }, delay);
        
        console.log(`Scheduled delivery notification for ${recipientEmail} in ${Math.round(delay / 1000 / 60)} minutes`);
    }
}

// On server start, reschedule any pending delivery notifications
function reschedulePendingDeliveries() {
    const now = Date.now();
    
    db.messages.forEach(msg => {
        if (!msg.notificationSent && msg.deliveryTime > now) {
            scheduleDeliveryNotification(msg.to, msg.deliveryTime);
        }
    });
    
    console.log('Rescheduled pending delivery notifications');
}

// API Routes

// Send verification code
app.post('/api/send-code', async (req, res) => {
    const { email } = req.body;
    
    if (!email || !email.endsWith('@ucsc.edu')) {
        return res.status(400).json({ error: 'Must use a @ucsc.edu email address' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    db.pendingCodes[email] = {
        code: code,
        timestamp: Date.now()
    };
    saveDB(db);

    const sent = await sendEmail(email, emailTemplates.verification(code));
    
    if (sent) {
        res.json({ success: true, message: 'Verification code sent' });
    } else {
        res.status(500).json({ error: 'Failed to send email' });
    }
});

// Verify code
app.post('/api/verify-code', (req, res) => {
    const { email, code } = req.body;
    
    const pending = db.pendingCodes[email];
    if (!pending || pending.code !== code) {
        return res.status(400).json({ error: 'Invalid verification code' });
    }

    if (Date.now() - pending.timestamp > 15 * 60 * 1000) {
        return res.status(400).json({ error: 'Code expired' });
    }

    // Create user if doesn't exist
    if (!db.users[email]) {
        db.users[email] = {
            email: email,
            intro: '',
            matched: false,
            partnerId: null,
            createdAt: Date.now()
        };
    }

    delete db.pendingCodes[email];
    saveDB(db);

    res.json({ 
        success: true, 
        user: db.users[email]
    });
});

// Get user data
app.get('/api/user/:email', (req, res) => {
    const { email } = req.params;
    const user = db.users[email];
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
});

// Submit introduction
app.post('/api/submit-intro', async (req, res) => {
    const { email, intro } = req.body;
    
    if (!db.users[email]) {
        return res.status(404).json({ error: 'User not found' });
    }

    if (intro.length < 20) {
        return res.status(400).json({ error: 'Introduction too short' });
    }

    db.users[email].intro = intro;
    saveDB(db);

    // Notify admin
    await sendEmail(ADMIN_EMAIL, emailTemplates.adminNewSignup(email, intro));

    res.json({ success: true });
});

// Get messages for a user
app.get('/api/messages/:email', (req, res) => {
    const { email } = req.params;
    const user = db.users[email];
    
    if (!user || !user.matched) {
        return res.json({ messages: [] });
    }

    const partnerId = user.partnerId;
    const now = Date.now();

    const messages = db.messages.filter(m => 
        (m.from === email && m.to === partnerId) ||
        (m.from === partnerId && m.to === email)
    ).map(m => ({
        ...m,
        delivered: now >= m.deliveryTime,
        // Hide content if not delivered and not from this user
        content: (now >= m.deliveryTime || m.from === email) ? m.content : null
    })).sort((a, b) => a.timestamp - b.timestamp);

    res.json({ messages });
});

// Send message
app.post('/api/send-message', async (req, res) => {
    const { email, content } = req.body;
    const user = db.users[email];
    
    if (!user || !user.matched) {
        return res.status(400).json({ error: 'Not matched' });
    }

    if (content.length < 10) {
        return res.status(400).json({ error: 'Message too short' });
    }

    const partnerId = user.partnerId;
    const deliveryTime = Date.now() + (12 * 60 * 60 * 1000); // 12 hours

    const message = {
        id: Date.now().toString(),
        from: email,
        to: partnerId,
        content: content,
        timestamp: Date.now(),
        deliveryTime: deliveryTime,
        delivered: false,
        notificationSent: false
    };

    db.messages.push(message);
    saveDB(db);

    // Schedule the delivery notification email for 12 hours from now
    scheduleDeliveryNotification(partnerId, deliveryTime);

    res.json({ success: true, message });
});

// End conversation
app.post('/api/end-conversation', (req, res) => {
    const { email } = req.body;
    const user = db.users[email];
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    const partnerId = user.partnerId;

    db.users[email].matched = false;
    db.users[email].partnerId = null;
    db.users[email].intro = ''; // Reset intro so they can write a new one
    
    if (db.users[partnerId]) {
        db.users[partnerId].matched = false;
        db.users[partnerId].partnerId = null;
        db.users[partnerId].intro = '';
    }

    saveDB(db);
    res.json({ success: true });
});

// Admin routes
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    
    if (password === ADMIN_PASSWORD) {
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

app.get('/api/admin/unmatched', (req, res) => {
    const unmatched = Object.values(db.users).filter(u => !u.matched && u.intro);
    res.json({ users: unmatched });
});

app.get('/api/admin/matches', (req, res) => {
    const matches = [];
    const processed = new Set();

    Object.values(db.users).forEach(user => {
        if (user.matched && user.partnerId) {
            const pairKey = [user.email, user.partnerId].sort().join('|');
            
            if (!processed.has(pairKey)) {
                processed.add(pairKey);
                
                const conversation = db.messages.filter(m => 
                    (m.from === user.email && m.to === user.partnerId) ||
                    (m.from === user.partnerId && m.to === user.email)
                );

                matches.push({
                    user1: user.email,
                    user2: user.partnerId,
                    messageCount: conversation.length,
                    lastMessage: conversation.length > 0 ? 
                        Math.max(...conversation.map(m => m.timestamp)) : 0
                });
            }
        }
    });

    res.json({ matches: matches.sort((a, b) => b.lastMessage - a.lastMessage) });
});

app.get('/api/admin/conversation/:email1/:email2', (req, res) => {
    const { email1, email2 } = req.params;
    
    const messages = db.messages.filter(m => 
        (m.from === email1 && m.to === email2) ||
        (m.from === email2 && m.to === email1)
    ).sort((a, b) => a.timestamp - b.timestamp);

    res.json({ messages });
});

app.post('/api/admin/match', async (req, res) => {
    const { email1, email2 } = req.body;
    
    if (!db.users[email1] || !db.users[email2]) {
        return res.status(404).json({ error: 'User not found' });
    }

    if (db.users[email1].matched || db.users[email2].matched) {
        return res.status(400).json({ error: 'User already matched' });
    }

    // Match both users
    db.users[email1].matched = true;
    db.users[email1].partnerId = email2;
    db.users[email2].matched = true;
    db.users[email2].partnerId = email1;
    saveDB(db);

    // Send match notifications to both users
    await sendEmail(email1, emailTemplates.matchNotification(db.users[email2].intro));
    await sendEmail(email2, emailTemplates.matchNotification(db.users[email1].intro));

    res.json({ success: true });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// TEST ENDPOINT - Send a test email to any address (REMOVE IN PRODUCTION)
app.post('/api/test-email', async (req, res) => {
    console.log('==== TEST EMAIL REQUEST RECEIVED ====');
    console.log('Request body:', req.body);
    
    const { email } = req.body;
    
    if (!email) {
        console.log('Error: No email provided');
        return res.status(400).json({ error: 'Email address required' });
    }

    console.log(`Sending test email to: ${email}`);

    const testTemplate = {
        subject: 'Test Email - UCSC Penpals',
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; background: #0a1929; color: #ffffff; border-radius: 8px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <img src="https://i.imgur.com/HeS0J6I.png" alt="Slug" style="width: 60px; height: auto; margin-bottom: 10px;">
                    <img src="https://i.imgur.com/TTnGAdD.jpeg" alt="UCSC Penpals" style="width: 80px; height: 80px; border-radius: 12px;">
                </div>
                <h1 style="color: #ffd54f; text-align: center; font-size: 24px; font-weight: 500;">Test Email Successful!</h1>
                <p style="text-align: center; color: rgba(255,255,255,0.8);">If you're seeing this, your email configuration is working correctly.</p>
                <div style="background: #1a2332; padding: 20px; text-align: center; margin: 20px 0; border-radius: 4px; border: 1px solid #2a4a6f;">
                    <p style="color: #ffd54f; font-size: 18px; margin: 0;">✅ Email system is operational</p>
                </div>
                <p style="text-align: center; color: rgba(255,255,255,0.6); font-size: 14px;">Sent at: ${new Date().toLocaleString()}</p>
                <hr style="border: none; border-top: 1px solid #2a4a6f; margin: 20px 0;">
                <p style="text-align: center; color: rgba(255,255,255,0.5); font-size: 12px;">UCSC Penpals - Connect with fellow Banana Slugs, one letter at a time!</p>
            </div>
        `
    };

    const sent = await sendEmail(email, testTemplate);
    
    console.log(`Email send result: ${sent}`);
    
    if (sent) {
        res.json({ success: true, message: `Test email sent to ${email}` });
    } else {
        res.status(500).json({ error: 'Failed to send email. Check your EMAIL_USER and EMAIL_PASSWORD environment variables.' });
    }
});

// TEST PAGE - Simple HTML page to test emails (REMOVE IN PRODUCTION)
app.get('/test', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>UCSC Penpals - Email Test</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: #0a1929;
                    color: #fff;
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }
                .container {
                    background: #1a2332;
                    padding: 40px;
                    border-radius: 12px;
                    max-width: 500px;
                    width: 100%;
                    border: 1px solid #2a4a6f;
                }
                h1 {
                    color: #ffd54f;
                    margin-bottom: 10px;
                    font-size: 24px;
                }
                p {
                    color: rgba(255,255,255,0.7);
                    margin-bottom: 20px;
                }
                label {
                    display: block;
                    color: #ffd54f;
                    margin-bottom: 8px;
                    font-size: 14px;
                }
                input {
                    width: 100%;
                    padding: 12px 16px;
                    border: 1px solid #2a4a6f;
                    border-radius: 8px;
                    background: #0a1929;
                    color: #fff;
                    font-size: 16px;
                    margin-bottom: 20px;
                }
                input:focus {
                    outline: none;
                    border-color: #ffd54f;
                }
                button {
                    width: 100%;
                    padding: 14px;
                    background: linear-gradient(135deg, #2196f3, #1565c0);
                    color: #fff;
                    border: none;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: transform 0.2s, box-shadow 0.2s;
                }
                button:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 20px rgba(33, 150, 243, 0.4);
                }
                button:disabled {
                    background: #3a4a5a;
                    cursor: not-allowed;
                    transform: none;
                    box-shadow: none;
                }
                .result {
                    margin-top: 20px;
                    padding: 16px;
                    border-radius: 8px;
                    display: none;
                }
                .result.success {
                    background: rgba(76, 175, 80, 0.2);
                    border: 1px solid #4caf50;
                    color: #4caf50;
                }
                .result.error {
                    background: rgba(244, 67, 54, 0.2);
                    border: 1px solid #f44336;
                    color: #f44336;
                }
                .config {
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #2a4a6f;
                }
                .config h2 {
                    color: #ffd54f;
                    font-size: 16px;
                    margin-bottom: 10px;
                }
                .config-item {
                    display: flex;
                    justify-content: space-between;
                    padding: 8px 0;
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                }
                .config-item span:first-child {
                    color: rgba(255,255,255,0.6);
                }
                .config-item span:last-child {
                    color: #4caf50;
                }
                .warning {
                    background: rgba(255, 152, 0, 0.2);
                    border: 1px solid #ff9800;
                    color: #ff9800;
                    padding: 12px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    font-size: 14px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>📧 Email Test Panel</h1>
                <p>Test if your email configuration is working correctly.</p>
                
                <div class="warning">
                    ⚠️ This test page should be removed before going live!
                </div>
                
                <label>Send test email to:</label>
                <input type="email" id="testEmail" placeholder="your-email@example.com">
                <button onclick="sendTestEmail()" id="sendBtn">Send Test Email</button>
                
                <div class="result" id="result"></div>
                
                <div class="config">
                    <h2>Current Configuration</h2>
                    <div class="config-item">
                        <span>Email Service:</span>
                        <span>${process.env.EMAIL_SERVICE || 'gmail'}</span>
                    </div>
                    <div class="config-item">
                        <span>Email User:</span>
                        <span>${process.env.EMAIL_USER ? '✓ Set' : '✗ Not set'}</span>
                    </div>
                    <div class="config-item">
                        <span>Email Password:</span>
                        <span>${process.env.EMAIL_PASSWORD ? '✓ Set' : '✗ Not set'}</span>
                    </div>
                    <div class="config-item">
                        <span>Admin Email:</span>
                        <span>${process.env.ADMIN_EMAIL || process.env.EMAIL_USER || 'Not set'}</span>
                    </div>
                    <div class="config-item">
                        <span>Website URL:</span>
                        <span>${process.env.WEBSITE_URL || 'Not set'}</span>
                    </div>
                </div>
            </div>
            
            <script>
                async function sendTestEmail() {
                    const email = document.getElementById('testEmail').value;
                    const btn = document.getElementById('sendBtn');
                    const result = document.getElementById('result');
                    
                    if (!email) {
                        alert('Please enter an email address');
                        return;
                    }
                    
                    btn.disabled = true;
                    btn.textContent = 'Sending...';
                    result.style.display = 'none';
                    
                    try {
                        const response = await fetch('/api/test-email', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email })
                        });
                        
                        const data = await response.json();
                        
                        result.style.display = 'block';
                        if (response.ok) {
                            result.className = 'result success';
                            result.textContent = '✓ ' + data.message;
                        } else {
                            result.className = 'result error';
                            result.textContent = '✗ ' + data.error;
                        }
                    } catch (error) {
                        result.style.display = 'block';
                        result.className = 'result error';
                        result.textContent = '✗ Network error: ' + error.message;
                    }
                    
                    btn.disabled = false;
                    btn.textContent = 'Send Test Email';
                }
            </script>
        </body>
        </html>
    `);
});

// Start server
app.listen(PORT, () => {
    console.log(`UCSC Penpals server running on port ${PORT}`);
    console.log(`Admin email: ${ADMIN_EMAIL}`);
    
    // Reschedule any pending delivery notifications
    reschedulePendingDeliveries();
});
