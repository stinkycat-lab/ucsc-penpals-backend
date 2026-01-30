// UCSC Penpals Backend Server
// Handles email verification, notifications, and data storage
// Uses JSONbin.io for persistent database storage

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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
                <p style="text-align: center; color: rgba(255,255,255,0.6); font-size: 14px;">Remember: Messages take 1 minute to deliver!</p>
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

// Send verification code
app.post('/api/send-code', async (req, res) => {
    const { email } = req.body;
    
    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Please enter a valid email address' });
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
    const deliveryTime = Date.now() + (1 * 60 * 1000); // 1 minute

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

    // Schedule the delivery notification email for 1 minute from now
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

// TEST ENDPOINT - Send a test email to any address (REMOVE IN PRODUCTION)
app.post('/api/test-email', async (req, res) => {
    console.log('==== TEST EMAIL REQUEST RECEIVED ====');
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ error: 'Email address required' });
    }

    const testTemplate = {
        subject: 'Test Email - UCSC Penpals',
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; background: #0a1929; color: #ffffff; border-radius: 8px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <img src="https://i.imgur.com/HeS0J6I.png" alt="Slug" width="60" height="60" style="display: block; margin: 0 auto 10px auto; width: 60px; height: auto;">
                    <img src="https://i.imgur.com/TTnGAdD.jpeg" alt="UCSC Penpals" width="80" height="80" style="display: block; margin: 0 auto; width: 80px; height: 80px; border-radius: 12px;">
                </div>
                <h1 style="color: #ffd54f; text-align: center; font-size: 24px; font-weight: 500;">Test Email Successful!</h1>
                <p style="text-align: center; color: rgba(255,255,255,0.8);">If you're seeing this, your email configuration is working correctly.</p>
                <div style="background: #1a2332; padding: 20px; text-align: center; margin: 20px 0; border-radius: 4px; border: 1px solid #2a4a6f;">
                    <p style="color: #ffd54f; font-size: 18px; margin: 0;">✅ Email system is operational</p>
                </div>
                <p style="text-align: center; color: rgba(255,255,255,0.6); font-size: 14px;">Sent at: ${new Date().toLocaleString()}</p>
            </div>
        `
    };

    const sent = await sendEmail(email, testTemplate);
    
    if (sent) {
        res.json({ success: true, message: `Test email sent to ${email}` });
    } else {
        res.status(500).json({ error: 'Failed to send email. Check your RESEND_API_KEY.' });
    }
});

// TEST PAGE
app.get('/test', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>UCSC Penpals - Test Panel</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: -apple-system, sans-serif; background: #0a1929; color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
                .container { background: #1a2332; padding: 40px; border-radius: 12px; max-width: 500px; width: 100%; border: 1px solid #2a4a6f; }
                h1 { color: #ffd54f; margin-bottom: 10px; font-size: 24px; }
                p { color: rgba(255,255,255,0.7); margin-bottom: 20px; }
                label { display: block; color: #ffd54f; margin-bottom: 8px; font-size: 14px; }
                input { width: 100%; padding: 12px 16px; border: 1px solid #2a4a6f; border-radius: 8px; background: #0a1929; color: #fff; font-size: 16px; margin-bottom: 20px; }
                button { width: 100%; padding: 14px; background: linear-gradient(135deg, #2196f3, #1565c0); color: #fff; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; }
                button:hover { transform: translateY(-2px); box-shadow: 0 4px 20px rgba(33, 150, 243, 0.4); }
                .result { margin-top: 20px; padding: 16px; border-radius: 8px; display: none; }
                .result.success { background: rgba(76, 175, 80, 0.2); border: 1px solid #4caf50; color: #4caf50; }
                .result.error { background: rgba(244, 67, 54, 0.2); border: 1px solid #f44336; color: #f44336; }
                .config { margin-top: 30px; padding-top: 20px; border-top: 1px solid #2a4a6f; }
                .config h2 { color: #ffd54f; font-size: 16px; margin-bottom: 10px; }
                .config-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); font-size: 14px; }
                .config-item span:first-child { color: rgba(255,255,255,0.6); }
                .config-item span:last-child { color: #4caf50; }
                .warning { background: rgba(255, 152, 0, 0.2); border: 1px solid #ff9800; color: #ff9800; padding: 12px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>📧 Email Test Panel</h1>
                <p>Test if your email configuration is working correctly.</p>
                <div class="warning">⚠️ Remove this test page before going live!</div>
                <label>Send test email to:</label>
                <input type="email" id="testEmail" placeholder="your-email@example.com">
                <button onclick="sendTestEmail()">Send Test Email</button>
                <div class="result" id="result"></div>
                <div class="config">
                    <h2>Current Configuration</h2>
                    <div class="config-item"><span>Database:</span><span>${JSONBIN_BIN_ID ? '✓ JSONbin connected' : '✗ Not configured'}</span></div>
                    <div class="config-item"><span>Resend API:</span><span>${RESEND_API_KEY ? '✓ Set' : '✗ Not set'}</span></div>
                    <div class="config-item"><span>From Address:</span><span>${EMAIL_FROM}</span></div>
                    <div class="config-item"><span>Admin Email:</span><span>${ADMIN_EMAIL}</span></div>
                </div>
            </div>
            <script>
                async function sendTestEmail() {
                    const email = document.getElementById('testEmail').value;
                    const result = document.getElementById('result');
                    if (!email) { alert('Please enter an email'); return; }
                    result.style.display = 'none';
                    try {
                        const response = await fetch('/api/test-email', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email })
                        });
                        const data = await response.json();
                        result.style.display = 'block';
                        result.className = response.ok ? 'result success' : 'result error';
                        result.textContent = response.ok ? '✓ ' + data.message : '✗ ' + data.error;
                    } catch (error) {
                        result.style.display = 'block';
                        result.className = 'result error';
                        result.textContent = '✗ Network error';
                    }
                }
            </script>
        </body>
        </html>
    `);
});

// Start server
app.listen(PORT, async () => {
    console.log(`UCSC Penpals server running on port ${PORT}`);
    console.log(`Using JSONbin.io for database storage`);
    console.log(`JSONbin Bin ID: ${JSONBIN_BIN_ID ? 'Configured' : 'NOT SET'}`);
    console.log(`Resend API Key: ${RESEND_API_KEY ? 'Set' : 'NOT SET'}`);
    
    // Load initial database
    await loadDB();
    
    // Reschedule pending deliveries
    await reschedulePendingDeliveries();
});
