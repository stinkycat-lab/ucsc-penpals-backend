// UCSC Penpals Backend Server
// Handles email verification, notifications, and data storage
// Uses JSONbin.io for persistent database storage

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// EASY CONFIGURATION - Change these values as needed!
// ============================================================

// Message delivery delay - how long before messages are delivered
// Examples:
//   1 minute:  1 * 60 * 1000
//   5 minutes: 5 * 60 * 1000
//   1 hour:    1 * 60 * 60 * 1000
//   12 hours:  12 * 60 * 60 * 1000
//   24 hours:  24 * 60 * 60 * 1000
const MESSAGE_DELIVERY_DELAY = 12 * 60 * 60 * 1000; // 12 hours (default)

// Human-readable version for display in emails/UI
const DELIVERY_TIME_TEXT = "12 hours";

// Allowed test emails (exceptions to @ucsc.edu requirement)
// Add any non-ucsc.edu emails here for testing purposes
const ALLOWED_TEST_EMAILS = [
    '',
     
];

// ============================================================

// Middleware
app.use(cors());
app.use(express.json());

// JSONbin.io configuration
const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY;
const JSONBIN_BIN_ID = process.env.JSONBIN_BIN_ID;
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`;

// In-memory cache of database (to reduce API calls)
let dbCache = null;
let lastFetch = 0;
const CACHE_TTL = 5000; // 5 seconds cache

// Load database from JSONbin
async function loadDB() {
    const now = Date.now();
    
    // Return cache if still valid
    if (dbCache && (now - lastFetch) < CACHE_TTL) {
        return dbCache;
    }
    
    try {
        const response = await fetch(JSONBIN_URL + '/latest', {
            headers: {
                'X-Master-Key': JSONBIN_API_KEY
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            dbCache = data.record;
            lastFetch = now;
            console.log('Database loaded from JSONbin');
            return dbCache;
        } else {
            console.error('Failed to load from JSONbin:', response.status);
            // Return default structure if load fails
            return dbCache || {
                users: {},
                pendingCodes: {},
                messages: [],
                matches: {}
            };
        }
    } catch (error) {
        console.error('Error loading database:', error);
        return dbCache || {
            users: {},
            pendingCodes: {},
            messages: [],
            matches: {}
        };
    }
}

// Save database to JSONbin
async function saveDB(db) {
    dbCache = db; // Update cache immediately
    lastFetch = Date.now();
    
    try {
        const response = await fetch(JSONBIN_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': JSONBIN_API_KEY
            },
            body: JSON.stringify(db)
        });
        
        if (response.ok) {
            console.log('Database saved to JSONbin');
            return true;
        } else {
            console.error('Failed to save to JSONbin:', response.status);
            return false;
        }
    } catch (error) {
        console.error('Error saving database:', error);
        return false;
    }
}

// Admin email for notifications
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@ucscpenpals.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const WEBSITE_URL = process.env.WEBSITE_URL || 'http://localhost:3000';
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// Email sender - use your verified domain or onboarding@resend.dev for testing
const EMAIL_FROM = process.env.EMAIL_FROM || 'UCSC Penpals <onboarding@resend.dev>';

// Email templates
const emailTemplates = {
    verification: (code) => ({
        subject: 'Your Verification Code - UCSC Penpals',
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; background: #0a1929; color: #ffffff; border-radius: 8px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <img src="https://i.imgur.com/HeS0J6I.png" alt="Slug" width="60" height="60" style="display: block; margin: 0 auto 10px auto; width: 60px; height: auto;">
                    <img src="https://i.imgur.com/TTnGAdD.jpeg" alt="UCSC Penpals" width="80" height="80" style="display: block; margin: 0 auto; width: 80px; height: 80px; border-radius: 12px;">
                </div>
                <h1 style="color: #ffd54f; text-align: center; font-size: 24px; font-weight: 500;">Your Verification Code</h1>
                <p style="text-align: center; color: rgba(255,255,255,0.8);">Enter this code to verify your email:</p>
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
                    <img src="https://i.imgur.com/HeS0J6I.png" alt="Slug" width="60" height="60" style="display: block; margin: 0 auto 10px auto; width: 60px; height: auto;">
                    <img src="https://i.imgur.com/TTnGAdD.jpeg" alt="UCSC Penpals" width="80" height="80" style="display: block; margin: 0 auto; width: 80px; height: 80px; border-radius: 12px;">
                </div>
                <h1 style="color: #ffd54f; text-align: center; font-size: 24px; font-weight: 500;">You've Been Matched!</h1>
                <p style="text-align: center; color: rgba(255,255,255,0.8);">Great news! You've been paired with a penpal.</p>
                <div style="background: #1a2332; padding: 20px; margin: 20px 0; border-radius: 4px; border: 1px solid #2a4a6f;">
                    <p style="color: #ffd54f; font-size: 14px; margin-bottom: 10px; letter-spacing: 1px;">Your Penpal's Introduction:</p>
                    <p style="color: rgba(255,255,255,0.9); line-height: 1.6; font-style: italic;">"${partnerIntro}"</p>
                </div>
                <div style="text-align: center; margin: 25px 0;">
                    <a href="${WEBSITE_URL}" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #2196f3 0%, #1565c0 100%); color: white; text-decoration: none; border-radius: 4px; font-weight: 500;">Write Your First Letter</a>
                </div>
                <p style="text-align: center; color: rgba(255,255,255,0.6); font-size: 14px;">Remember: Messages take ${DELIVERY_TIME_TEXT} to deliver, just like real letters!</p>
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
                    <img src="https://i.imgur.com/HeS0J6I.png" alt="Slug" width="60" height="60" style="display: block; margin: 0 auto 10px auto; width: 60px; height: auto;">
                    <img src="https://i.imgur.com/TTnGAdD.jpeg" alt="UCSC Penpals" width="80" height="80" style="display: block; margin: 0 auto; width: 80px; height: 80px; border-radius: 12px;">
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
                    <img src="https://i.imgur.com/HeS0J6I.png" alt="Slug" width="60" height="60" style="display: block; margin: 0 auto 10px auto; width: 60px; height: auto;">
                    <img src="https://i.imgur.com/TTnGAdD.jpeg" alt="UCSC Penpals" width="80" height="80" style="display: block; margin: 0 auto; width: 80px; height: 80px; border-radius: 12px;">
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

// Send email using Resend API
async function sendEmail(to, template) {
    console.log(`Attempting to send email to: ${to}`);
    console.log(`Subject: ${template.subject}`);
    
    if (!RESEND_API_KEY) {
        console.error('ERROR: RESEND_API_KEY is not set!');
        return false;
    }

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: EMAIL_FROM,
                to: to,
                subject: template.subject,
                html: template.html
            })
        });

        const data = await response.json();
        
        if (response.ok) {
            console.log(`Email sent successfully to ${to}`);
            console.log(`Resend ID: ${data.id}`);
            return true;
        } else {
            console.error('==== RESEND API ERROR ====');
            console.error('Status:', response.status);
            console.error('Response:', data);
            return false;
        }
    } catch (error) {
        console.error('==== EMAIL ERROR ====');
        console.error('Error:', error.message);
        return false;
    }
}

// Schedule message delivery notification
function scheduleDeliveryNotification(recipientEmail, deliveryTime) {
    const delay = deliveryTime - Date.now();
    
    if (delay > 0) {
        setTimeout(async () => {
            await sendEmail(recipientEmail, emailTemplates.messageDelivered());
            console.log(`Delivery notification sent to ${recipientEmail}`);
        }, delay);
        
        console.log(`Scheduled delivery notification for ${recipientEmail} in ${Math.round(delay / 1000 / 60)} minutes`);
    }
}

// On server start, reschedule any pending delivery notifications
async function reschedulePendingDeliveries() {
    const db = await loadDB();
    const now = Date.now();
    
    if (db.messages) {
        db.messages.forEach(msg => {
            if (!msg.notificationSent && msg.deliveryTime > now) {
                scheduleDeliveryNotification(msg.to, msg.deliveryTime);
            }
        });
    }
    
    console.log('Rescheduled pending delivery notifications');
}

// API Routes

// Helper function to check if email is allowed
function isEmailAllowed(email) {
    // Check if it's a @ucsc.edu email
    if (email.endsWith('@ucsc.edu')) {
        return true;
    }
    // Check if it's in the allowed test emails list
    if (ALLOWED_TEST_EMAILS.includes(email.toLowerCase())) {
        return true;
    }
    return false;
}

// Send verification code
app.post('/api/send-code', async (req, res) => {
    const { email } = req.body;
    
    if (!email || !isEmailAllowed(email)) {
        return res.status(400).json({ error: 'Must use a @ucsc.edu email address' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    const db = await loadDB();
    db.pendingCodes[email] = {
        code: code,
        timestamp: Date.now()
    };
    await saveDB(db);

    const sent = await sendEmail(email, emailTemplates.verification(code));
    
    if (sent) {
        res.json({ success: true, message: 'Verification code sent' });
    } else {
        res.status(500).json({ error: 'Failed to send email' });
    }
});

// Verify code
app.post('/api/verify-code', async (req, res) => {
    const { email, code } = req.body;
    
    const db = await loadDB();
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
    await saveDB(db);

    res.json({ 
        success: true, 
        user: db.users[email]
    });
});

// Get user data
app.get('/api/user/:email', async (req, res) => {
    const { email } = req.params;
    const db = await loadDB();
    const user = db.users[email];
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
});

// Submit introduction
app.post('/api/submit-intro', async (req, res) => {
    const { email, intro } = req.body;
    
    const db = await loadDB();
    
    // Auto-create user if they don't exist (in case session was lost)
    if (!db.users[email]) {
        db.users[email] = {
            email: email,
            intro: '',
            matched: false,
            partnerId: null,
            createdAt: Date.now()
        };
    }

    db.users[email].intro = intro || '';
    await saveDB(db);

    // Notify admin
    await sendEmail(ADMIN_EMAIL, emailTemplates.adminNewSignup(email, intro || '(No introduction provided)'));

    res.json({ success: true });
});

// Get messages for a user
app.get('/api/messages/:email', async (req, res) => {
    const { email } = req.params;
    const db = await loadDB();
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
        content: (now >= m.deliveryTime || m.from === email) ? m.content : null
    })).sort((a, b) => a.timestamp - b.timestamp);

    res.json({ messages });
});

// Send message
app.post('/api/send-message', async (req, res) => {
    const { email, content } = req.body;
    const db = await loadDB();
    const user = db.users[email];
    
    if (!user || !user.matched) {
        return res.status(400).json({ error: 'Not matched' });
    }

    const partnerId = user.partnerId;
    const deliveryTime = Date.now() + MESSAGE_DELIVERY_DELAY;

    const message = {
        id: Date.now().toString(),
        from: email,
        to: partnerId,
        content: content || '',
        timestamp: Date.now(),
        deliveryTime: deliveryTime,
        delivered: false,
        notificationSent: false
    };

    db.messages.push(message);
    await saveDB(db);

    // Schedule the delivery notification email
    scheduleDeliveryNotification(partnerId, deliveryTime);

    res.json({ success: true, message });
});

// End conversation
app.post('/api/end-conversation', async (req, res) => {
    const { email } = req.body;
    const db = await loadDB();
    const user = db.users[email];
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    const partnerId = user.partnerId;

    db.users[email].matched = false;
    db.users[email].partnerId = null;
    db.users[email].intro = '';
    
    if (db.users[partnerId]) {
        db.users[partnerId].matched = false;
        db.users[partnerId].partnerId = null;
        db.users[partnerId].intro = '';
    }

    await saveDB(db);
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

app.get('/api/admin/unmatched', async (req, res) => {
    const db = await loadDB();
    const unmatched = Object.values(db.users).filter(u => !u.matched && u.intro);
    res.json({ users: unmatched });
});

app.get('/api/admin/matches', async (req, res) => {
    const db = await loadDB();
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

app.get('/api/admin/conversation/:email1/:email2', async (req, res) => {
    const { email1, email2 } = req.params;
    const db = await loadDB();
    
    const messages = db.messages.filter(m => 
        (m.from === email1 && m.to === email2) ||
        (m.from === email2 && m.to === email1)
    ).sort((a, b) => a.timestamp - b.timestamp);

    res.json({ messages });
});

app.post('/api/admin/match', async (req, res) => {
    const { email1, email2 } = req.body;
    const db = await loadDB();
    
    if (!db.users[email1] || !db.users[email2]) {
        return res.status(404).json({ error: 'User not found' });
    }

    if (db.users[email1].matched || db.users[email2].matched) {
        return res.status(400).json({ error: 'User already matched' });
    }

    db.users[email1].matched = true;
    db.users[email1].partnerId = email2;
    db.users[email2].matched = true;
    db.users[email2].partnerId = email1;
    await saveDB(db);

    await sendEmail(email1, emailTemplates.matchNotification(db.users[email2].intro));
    await sendEmail(email2, emailTemplates.matchNotification(db.users[email1].intro));

    res.json({ success: true });
});

// Health check
app.get('/api/health', async (req, res) => {
    const db = await loadDB();
    res.json({ 
        status: 'ok', 
        timestamp: Date.now(),
        userCount: Object.keys(db.users).length,
        messageCount: db.messages.length
    });
});

// Start server
app.listen(PORT, async () => {
    console.log(`UCSC Penpals server running on port ${PORT}`);
    console.log(`Message delivery delay: ${DELIVERY_TIME_TEXT}`);
    console.log(`Using JSONbin.io for database storage`);
    console.log(`JSONbin Bin ID: ${JSONBIN_BIN_ID ? 'Configured' : 'NOT SET'}`);
    console.log(`Resend API Key: ${RESEND_API_KEY ? 'Set' : 'NOT SET'}`);
    
    // Load initial database
    await loadDB();
    
    // Reschedule pending deliveries
    await reschedulePendingDeliveries();
});
