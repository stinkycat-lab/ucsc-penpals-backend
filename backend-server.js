// UCSC Penpals Backend Server
// Updated version with improved error handling, validation, and organization

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

// Request logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

// ============================================================================
// DATABASE MANAGEMENT
// ============================================================================

const DB_FILE = './database.json';

function loadDB() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            console.log('Database loaded successfully');
            return data;
        }
    } catch (e) {
        console.error('Error loading database:', e);
    }
    
    console.log('Creating new database');
    return {
        users: {},
        pendingCodes: {},
        messages: [],
        matches: {},
        metadata: {
            created: Date.now(),
            lastModified: Date.now()
        }
    };
}

function saveDB(db) {
    try {
        db.metadata.lastModified = Date.now();
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
        console.log('Database saved successfully');
    } catch (e) {
        console.error('Error saving database:', e);
    }
}

let db = loadDB();

// ============================================================================
// EMAIL CONFIGURATION
// ============================================================================

// Google Workspace / Custom Domain Gmail Configuration
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // Use SSL
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    },
    tls: {
        rejectUnauthorized: false
    },
    debug: true, // Enable debug output
    logger: true // Log information
});

// Verify email configuration on startup
transporter.verify(function(error, success) {
    if (error) {
        console.error('❌ Email configuration error:', error.message);
        console.error('Email User:', process.env.EMAIL_USER);
        console.error('Password length:', process.env.EMAIL_PASSWORD ? process.env.EMAIL_PASSWORD.length : 0);
    } else {
        console.log('✅ Email server is ready to send messages');
        console.log('Using email:', process.env.EMAIL_USER);
    }
});

// Admin configuration
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const WEBSITE_URL = process.env.WEBSITE_URL || 'http://localhost:3000';

// ============================================================================
// EMAIL TEMPLATES
// ============================================================================

const emailTemplates = {
    verification: (code) => ({
        subject: '🔐 UCSC Penpals - Your Verification Code',
        html: `
            <div style="font-family: Georgia, serif; max-width: 500px; margin: 0 auto; padding: 30px; background: #0a1929; color: #ffffff; border-radius: 8px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <img src="https://i.imgur.com/TTnGAdD.jpeg" alt="UCSC Penpals" style="width: 80px; height: 80px; border-radius: 12px;">
                </div>
                <h1 style="color: #ffd54f; text-align: center; font-size: 24px;">Your Verification Code</h1>
                <p style="text-align: center; color: rgba(255,255,255,0.8);">Enter this code to verify your UCSC email:</p>
                <div style="background: #1a2332; padding: 20px; text-align: center; margin: 20px 0; border-radius: 4px; border: 1px solid #2a4a6f;">
                    <span style="font-size: 36px; font-family: monospace; letter-spacing: 8px; color: #ffd54f;">${code}</span>
                </div>
                <p style="text-align: center; color: rgba(255,255,255,0.6); font-size: 14px;">This code expires in 15 minutes.</p>
                <hr style="border: none; border-top: 1px solid #2a4a6f; margin: 20px 0;">
                <p style="text-align: center; color: rgba(255,255,255,0.5); font-size: 12px;">UCSC Penpals - Connect with fellow Banana Slugs, one letter at a time</p>
            </div>
        `
    }),

    matchNotification: (partnerIntro) => ({
        subject: '💌 UCSC Penpals - You Have Been Matched!',
        html: `
            <div style="font-family: Georgia, serif; max-width: 500px; margin: 0 auto; padding: 30px; background: #0a1929; color: #ffffff; border-radius: 8px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <img src="https://i.imgur.com/TTnGAdD.jpeg" alt="UCSC Penpals" style="width: 80px; height: 80px; border-radius: 12px;">
                </div>
                <h1 style="color: #ffd54f; text-align: center; font-size: 24px;">You've Been Matched!</h1>
                <p style="text-align: center; color: rgba(255,255,255,0.8);">Great news! You've been paired with a fellow Slug.</p>
                <div style="background: #1a2332; padding: 20px; margin: 20px 0; border-radius: 4px; border: 1px solid #2a4a6f;">
                    <p style="color: #ffd54f; font-size: 14px; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 1px;">Your Penpal's Introduction:</p>
                    <p style="color: rgba(255,255,255,0.9); line-height: 1.6; font-style: italic;">"${partnerIntro}"</p>
                </div>
                <div style="text-align: center; margin: 25px 0;">
                    <a href="${WEBSITE_URL}" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #2196f3 0%, #1565c0 100%); color: white; text-decoration: none; border-radius: 4px; font-family: monospace; text-transform: uppercase; letter-spacing: 1px;">Write Your First Letter</a>
                </div>
                <p style="text-align: center; color: rgba(255,255,255,0.6); font-size: 14px;">Remember: Messages take 12 hours to deliver, just like real letters!</p>
                <hr style="border: none; border-top: 1px solid #2a4a6f; margin: 20px 0;">
                <p style="text-align: center; color: rgba(255,255,255,0.5); font-size: 12px;">UCSC Penpals - Connect with fellow Banana Slugs, one letter at a time</p>
            </div>
        `
    }),

    newMessage: () => ({
        subject: '✉️ UCSC Penpals - New Letter On Its Way!',
        html: `
            <div style="font-family: Georgia, serif; max-width: 500px; margin: 0 auto; padding: 30px; background: #0a1929; color: #ffffff; border-radius: 8px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <img src="https://i.imgur.com/TTnGAdD.jpeg" alt="UCSC Penpals" style="width: 80px; height: 80px; border-radius: 12px;">
                </div>
                <h1 style="color: #ffd54f; text-align: center; font-size: 24px;">A Letter Is On Its Way!</h1>
                <p style="text-align: center; color: rgba(255,255,255,0.8);">Your penpal has sent you a message.</p>
                <div style="background: #1a2332; padding: 20px; margin: 20px 0; border-radius: 4px; border: 1px solid #2a4a6f; text-align: center;">
                    <p style="color: #ffd54f; font-size: 18px;">📬 Arriving in 12 hours</p>
                    <p style="color: rgba(255,255,255,0.6); font-size: 14px; margin-top: 10px;">Just like a real letter, good things come to those who wait!</p>
                </div>
                <div style="text-align: center; margin: 25px 0;">
                    <a href="${WEBSITE_URL}" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #2196f3 0%, #1565c0 100%); color: white; text-decoration: none; border-radius: 4px; font-family: monospace; text-transform: uppercase; letter-spacing: 1px;">Check Your Mailbox</a>
                </div>
                <hr style="border: none; border-top: 1px solid #2a4a6f; margin: 20px 0;">
                <p style="text-align: center; color: rgba(255,255,255,0.5); font-size: 12px;">UCSC Penpals - Connect with fellow Banana Slugs, one letter at a time</p>
            </div>
        `
    }),

    messageDelivered: () => ({
        subject: '📬 UCSC Penpals - Your Letter Has Arrived!',
        html: `
            <div style="font-family: Georgia, serif; max-width: 500px; margin: 0 auto; padding: 30px; background: #0a1929; color: #ffffff; border-radius: 8px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <img src="https://i.imgur.com/TTnGAdD.jpeg" alt="UCSC Penpals" style="width: 80px; height: 80px; border-radius: 12px;">
                </div>
                <h1 style="color: #ffd54f; text-align: center; font-size: 24px;">Your Letter Has Arrived!</h1>
                <p style="text-align: center; color: rgba(255,255,255,0.8);">The wait is over - your penpal's message is ready to read!</p>
                <div style="text-align: center; margin: 25px 0;">
                    <a href="${WEBSITE_URL}" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #2196f3 0%, #1565c0 100%); color: white; text-decoration: none; border-radius: 4px; font-family: monospace; text-transform: uppercase; letter-spacing: 1px;">Read Your Letter</a>
                </div>
                <hr style="border: none; border-top: 1px solid #2a4a6f; margin: 20px 0;">
                <p style="text-align: center; color: rgba(255,255,255,0.5); font-size: 12px;">UCSC Penpals - Connect with fellow Banana Slugs, one letter at a time</p>
            </div>
        `
    }),

    adminNewSignup: (email, intro) => ({
        subject: '🆕 UCSC Penpals - New User Signup',
        html: `
            <div style="font-family: Georgia, serif; max-width: 500px; margin: 0 auto; padding: 30px; background: #0a1929; color: #ffffff; border-radius: 8px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <img src="https://i.imgur.com/TTnGAdD.jpeg" alt="UCSC Penpals" style="width: 80px; height: 80px; border-radius: 12px;">
                </div>
                <h1 style="color: #ffd54f; text-align: center; font-size: 24px;">New User Waiting for Match</h1>
                <div style="background: #1a2332; padding: 20px; margin: 20px 0; border-radius: 4px; border: 1px solid #2a4a6f;">
                    <p style="color: #2196f3; font-size: 14px; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 1px;">Email:</p>
                    <p style="color: rgba(255,255,255,0.9); margin-bottom: 15px;">${email}</p>
                    <p style="color: #ffd54f; font-size: 14px; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 1px;">Introduction:</p>
                    <p style="color: rgba(255,255,255,0.9); line-height: 1.6; font-style: italic;">"${intro}"</p>
                </div>
                <div style="text-align: center; margin: 25px 0;">
                    <a href="${WEBSITE_URL}" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #2196f3 0%, #1565c0 100%); color: white; text-decoration: none; border-radius: 4px; font-family: monospace; text-transform: uppercase; letter-spacing: 1px;">Go to Admin Panel</a>
                </div>
                <p style="text-align: center; color: rgba(255,255,255,0.6); font-size: 14px;">Log in to match this user with a penpal.</p>
            </div>
        `
    })
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function sendEmail(to, template) {
    try {
        await transporter.sendMail({
            from: `"UCSC Penpals" <${process.env.EMAIL_USER}>`,
            to: to,
            subject: template.subject,
            html: template.html
        });
        console.log(`✓ Email sent to ${to}: ${template.subject}`);
        return true;
    } catch (error) {
        console.error(`✗ Email error for ${to}:`, error.message);
        return false;
    }
}

function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function isValidUCSCEmail(email) {
    return email.endsWith('@ucsc.edu') || email.endsWith('@gmail.com'); // Allow gmail for testing
}

function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input.trim().substring(0, 5000); // Limit to 5000 chars
}

// Clean up expired verification codes periodically
setInterval(() => {
    const now = Date.now();
    const fifteenMinutes = 15 * 60 * 1000;
    let cleaned = 0;
    
    for (const email in db.pendingCodes) {
        if (now - db.pendingCodes[email].timestamp > fifteenMinutes) {
            delete db.pendingCodes[email];
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log(`Cleaned up ${cleaned} expired verification codes`);
        saveDB(db);
    }
}, 5 * 60 * 1000); // Run every 5 minutes

// ============================================================================
// API ROUTES - AUTHENTICATION
// ============================================================================

// Send verification code
app.post('/api/send-verification', async (req, res) => {
    try {
        const email = req.body.email?.toLowerCase().trim();
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        if (!isValidUCSCEmail(email)) {
            return res.status(400).json({ error: 'Must use a UCSC email address' });
        }

        const code = generateVerificationCode();
        db.pendingCodes[email] = {
            code: code,
            timestamp: Date.now()
        };
        saveDB(db);

        const emailSent = await sendEmail(email, emailTemplates.verification(code));
        
        if (!emailSent) {
            return res.status(500).json({ error: 'Failed to send verification email' });
        }

        res.json({ 
            success: true, 
            message: 'Verification code sent',
            email: email 
        });
    } catch (error) {
        console.error('Send verification error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Verify code and login/register
app.post('/api/verify-code', (req, res) => {
    try {
        const email = req.body.email?.toLowerCase().trim();
        const code = req.body.code?.trim();
        
        if (!email || !code) {
            return res.status(400).json({ error: 'Email and code are required' });
        }

        const pending = db.pendingCodes[email];
        
        if (!pending) {
            return res.status(400).json({ error: 'No verification code found. Please request a new one.' });
        }

        const fifteenMinutes = 15 * 60 * 1000;
        if (Date.now() - pending.timestamp > fifteenMinutes) {
            delete db.pendingCodes[email];
            saveDB(db);
            return res.status(400).json({ error: 'Verification code expired. Please request a new one.' });
        }

        if (pending.code !== code) {
            return res.status(400).json({ error: 'Invalid verification code' });
        }

        // Code is valid, remove it
        delete db.pendingCodes[email];

        // Create or update user
        if (!db.users[email]) {
            db.users[email] = {
                email: email,
                intro: '',
                matched: false,
                partnerId: null,
                createdAt: Date.now()
            };
            console.log(`New user registered: ${email}`);
        }

        db.users[email].lastLogin = Date.now();
        saveDB(db);

        res.json({ 
            success: true, 
            user: db.users[email] 
        });
    } catch (error) {
        console.error('Verify code error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============================================================================
// API ROUTES - USER MANAGEMENT
// ============================================================================

// Get user data
app.get('/api/user/:email', (req, res) => {
    try {
        const email = req.params.email.toLowerCase().trim();
        const user = db.users[email];
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Submit introduction
app.post('/api/submit-intro', async (req, res) => {
    try {
        const email = req.body.email?.toLowerCase().trim();
        const intro = sanitizeInput(req.body.intro);
        
        if (!email || !intro) {
            return res.status(400).json({ error: 'Email and introduction are required' });
        }

        const user = db.users[email];
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (intro.length < 20) {
            return res.status(400).json({ error: 'Introduction must be at least 20 characters' });
        }

        user.intro = intro;
        user.updatedAt = Date.now();
        saveDB(db);

        // Notify admin of new signup
        await sendEmail(ADMIN_EMAIL, emailTemplates.adminNewSignup(email, intro));

        res.json({ 
            success: true, 
            user 
        });
    } catch (error) {
        console.error('Submit intro error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============================================================================
// API ROUTES - MESSAGING
// ============================================================================

// Get messages for a user
app.get('/api/messages/:email', (req, res) => {
    try {
        const email = req.params.email.toLowerCase().trim();
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
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Send message
app.post('/api/send-message', async (req, res) => {
    try {
        const email = req.body.email?.toLowerCase().trim();
        const content = sanitizeInput(req.body.content);
        
        if (!email || !content) {
            return res.status(400).json({ error: 'Email and content are required' });
        }

        const user = db.users[email];
        
        if (!user || !user.matched) {
            return res.status(400).json({ error: 'Not matched with a penpal' });
        }

        if (content.length < 10) {
            return res.status(400).json({ error: 'Message must be at least 10 characters' });
        }

        const partnerId = user.partnerId;
        const deliveryTime = Date.now() + (12 * 60 * 60 * 1000); // 12 hours

        const message = {
            id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
            from: email,
            to: partnerId,
            content: content,
            timestamp: Date.now(),
            deliveryTime: deliveryTime,
            delivered: false
        };

        db.messages.push(message);
        saveDB(db);

        // Notify recipient that a message is on its way
        await sendEmail(partnerId, emailTemplates.newMessage());

        // Schedule delivery notification
        // Note: In production, use a proper job queue like Bull or Agenda
        setTimeout(async () => {
            try {
                await sendEmail(partnerId, emailTemplates.messageDelivered());
            } catch (error) {
                console.error('Error sending delivery notification:', error);
            }
        }, 12 * 60 * 60 * 1000);

        res.json({ 
            success: true, 
            message: {
                ...message,
                delivered: false,
                content: message.content // Sender can see their own message immediately
            }
        });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// End conversation
app.post('/api/end-conversation', (req, res) => {
    try {
        const email = req.body.email?.toLowerCase().trim();
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const user = db.users[email];
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const partnerId = user.partnerId;

        // Reset user
        user.matched = false;
        user.partnerId = null;
        user.intro = '';
        
        // Reset partner if exists
        if (partnerId && db.users[partnerId]) {
            db.users[partnerId].matched = false;
            db.users[partnerId].partnerId = null;
            db.users[partnerId].intro = '';
        }

        saveDB(db);
        
        console.log(`Conversation ended: ${email} and ${partnerId}`);
        res.json({ success: true });
    } catch (error) {
        console.error('End conversation error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============================================================================
// API ROUTES - ADMIN
// ============================================================================

// Admin login
app.post('/api/admin/login', (req, res) => {
    try {
        const password = req.body.password;
        
        if (password === ADMIN_PASSWORD) {
            console.log('Admin login successful');
            res.json({ success: true });
        } else {
            console.log('Failed admin login attempt');
            res.status(401).json({ error: 'Invalid password' });
        }
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get unmatched users
app.get('/api/admin/unmatched', (req, res) => {
    try {
        const unmatched = Object.values(db.users)
            .filter(u => !u.matched && u.intro)
            .map(u => ({
                email: u.email,
                intro: u.intro,
                createdAt: u.createdAt
            }))
            .sort((a, b) => b.createdAt - a.createdAt);
        
        res.json({ users: unmatched });
    } catch (error) {
        console.error('Get unmatched error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get all matches
app.get('/api/admin/matches', (req, res) => {
    try {
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

        res.json({ 
            matches: matches.sort((a, b) => b.lastMessage - a.lastMessage) 
        });
    } catch (error) {
        console.error('Get matches error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get conversation between two users
app.get('/api/admin/conversation/:email1/:email2', (req, res) => {
    try {
        const email1 = req.params.email1.toLowerCase().trim();
        const email2 = req.params.email2.toLowerCase().trim();
        
        const messages = db.messages.filter(m => 
            (m.from === email1 && m.to === email2) ||
            (m.from === email2 && m.to === email1)
        ).sort((a, b) => a.timestamp - b.timestamp);

        res.json({ messages });
    } catch (error) {
        console.error('Get conversation error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Match two users
app.post('/api/admin/match', async (req, res) => {
    try {
        const email1 = req.body.email1?.toLowerCase().trim();
        const email2 = req.body.email2?.toLowerCase().trim();
        
        if (!email1 || !email2) {
            return res.status(400).json({ error: 'Both email addresses are required' });
        }

        if (email1 === email2) {
            return res.status(400).json({ error: 'Cannot match a user with themselves' });
        }

        if (!db.users[email1]) {
            return res.status(404).json({ error: `User not found: ${email1}` });
        }

        if (!db.users[email2]) {
            return res.status(404).json({ error: `User not found: ${email2}` });
        }

        if (db.users[email1].matched) {
            return res.status(400).json({ error: `${email1} is already matched` });
        }

        if (db.users[email2].matched) {
            return res.status(400).json({ error: `${email2} is already matched` });
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

        console.log(`Successfully matched: ${email1} ↔ ${email2}`);
        res.json({ 
            success: true,
            match: {
                user1: email1,
                user2: email2
            }
        });
    } catch (error) {
        console.error('Match users error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============================================================================
// HEALTH & STATUS
// ============================================================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: Date.now(),
        users: Object.keys(db.users).length,
        messages: db.messages.length
    });
});

// Get statistics (admin)
app.get('/api/admin/stats', (req, res) => {
    try {
        const totalUsers = Object.keys(db.users).length;
        const matchedUsers = Object.values(db.users).filter(u => u.matched).length;
        const unmatchedUsers = Object.values(db.users).filter(u => !u.matched && u.intro).length;
        const totalMessages = db.messages.length;
        const deliveredMessages = db.messages.filter(m => Date.now() >= m.deliveryTime).length;
        
        res.json({
            totalUsers,
            matchedUsers,
            unmatchedUsers,
            totalMessages,
            deliveredMessages,
            pendingMessages: totalMessages - deliveredMessages
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ============================================================================
// SERVER START
// ============================================================================

app.listen(PORT, () => {
    console.log('═'.repeat(60));
    console.log('🐌 UCSC Penpals Server');
    console.log('═'.repeat(60));
    console.log(`Port: ${PORT}`);
    console.log(`Admin Email: ${ADMIN_EMAIL}`);
    console.log(`Website URL: ${WEBSITE_URL}`);
    console.log(`Database: ${DB_FILE}`);
    console.log(`Total Users: ${Object.keys(db.users).length}`);
    console.log(`Total Messages: ${db.messages.length}`);
    console.log('═'.repeat(60));
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, saving database and shutting down...');
    saveDB(db);
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\nSIGINT received, saving database and shutting down...');
    saveDB(db);
    process.exit(0);
});
