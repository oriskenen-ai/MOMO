# 🔧 Telegram Bot Notifications - Troubleshooting Guide

## ❌ Problem: "I'm not getting notifications from the bot"

Here are the complete solutions to fix this issue:

---

## ✅ **SOLUTION 1: Verify Bot Setup (First, Check This!)**

### Step 1: Make sure you have bot token in .env
```env
SUPER_ADMIN_BOT_TOKEN=123456789:ABCdefGHIjklmnoPQRstUVwxyz
```

**Where to get token:**
1. Open Telegram app
2. Search for "BotFather"
3. Send `/newbot`
4. Follow instructions
5. Copy the token you receive
6. Paste into `.env` file as `SUPER_ADMIN_BOT_TOKEN`

### Step 2: Restart server
```bash
npm start
```

Check logs - you should see:
```
✅ Bot connected: @YourBotName (Bot)
✅ Webhook CONFIRMED: https://your-url/telegram-webhook
```

---

## ✅ **SOLUTION 2: Register as Admin in Bot**

The bot won't send you messages unless you're registered!

### How to register:
1. Open Telegram
2. Find your bot (search by name)
3. Click **START** or send `/start`
4. Bot should respond with:
   ```
   👋 Welcome to InnBucks Admin Bot!
   Your Admin ID: 123456789
   ```

**Save your Admin ID** - you'll need it!

---

## ✅ **SOLUTION 3: Check User Registration in Database**

The bot sends messages to registered admins. Let's verify you're in the database:

### Check MongoDB:
```javascript
// In MongoDB Compass or mongosh:
use Cameroon
db.cameroon_admins.find()
```

You should see your admin record:
```json
{
  "_id": ObjectId("..."),
  "adminId": "123456789",
  "chatId": 987654321,
  "status": "active",
  "email": "your@email.com",
  "createdAt": "2024-05-18T..."
}
```

**If you don't see yourself:**
- Run `/start` command again in bot
- Check server logs for errors
- Make sure MongoDB is connected

---

## ✅ **SOLUTION 4: Check Server Logs**

The logs tell you what's happening. Look for:

### Good signs:
```
✅ Bot connected: @YourBotName
✅ Webhook CONFIRMED: https://your-url/telegram-webhook
💓 Keep-alive: X admins connected
📨 OTP resent for application APP-123
```

### Bad signs:
```
❌ No chat ID for admin: 123456789
❌ Bot error: 401 Unauthorized
❌ Webhook setup error: 403 Forbidden
```

**If you see errors:**
- Bot token is wrong → get new token from BotFather
- Webhook URL is wrong → check RENDER_EXTERNAL_URL or APP_URL in .env
- Bot is inactive → run `/start` again

---

## ✅ **SOLUTION 5: Test Bot Commands**

Make sure basic commands work:

### Test in Telegram:
```
/start          → Should register you
/myinfo         → Should show your admin info
/stats          → Should show statistics
/mylink         → Should show referral link
/pending        → Should show pending apps
```

**If commands don't work:**
1. You're not registered (run `/start`)
2. Bot isn't connected (check logs)
3. Database is down (check MongoDB connection)

---

## ✅ **SOLUTION 6: Enable Notifications**

Bot sends notifications for:

### 1. **New Applications**
When someone submits an application, all admins get notified:
```
📋 New Application Received!

ID: APP-123456
Name: John Doe
Phone: +237670123456
Amount: 1,000,000 XAF
Term: 48 Months
```

**Fix:** Make sure you're registered admin (run `/start`)

### 2. **OTP Events**
When user verifies OTP, you might get notification:
```
✅ OTP Verified
Application: APP-123
User: John Doe
Amount: 1,000,000 XAF
```

**Fix:** Make sure webhook is set correctly

### 3. **Command Responses**
When you use commands, you get immediate responses:
```
/stats → Statistics message
/pending → List of pending apps
/myinfo → Your info
```

**Fix:** Run commands and check bot is responding

---

## ✅ **SOLUTION 7: Complete Checklist**

Make sure ALL of these are true:

- [ ] **Bot Token Added**
  - SUPER_ADMIN_BOT_TOKEN is in .env
  - It's a valid token from BotFather
  - No spaces or extra characters

- [ ] **Server Running**
  - `npm start` is running
  - No errors in console
  - Database is connected

- [ ] **Registered as Admin**
  - You ran `/start` in bot
  - Bot confirmed your Admin ID
  - You're in database (cameroon_admins collection)

- [ ] **Webhook is Set**
  - Logs show "✅ Webhook CONFIRMED"
  - URL matches RENDER_EXTERNAL_URL or APP_URL
  - Bot can reach your server

- [ ] **Admin Status is Active**
  - Your status in database is "active"
  - Not paused or removed
  - You have correct permissions

- [ ] **Database Connected**
  - MongoDB URI is in .env
  - Connection is working
  - Collections exist

---

## 🔧 **SOLUTION 8: Manual Testing**

Test sending a message manually:

### In Node.js/server console:
```javascript
// Test if bot can send message
await bot.sendMessage(YOUR_CHAT_ID, "Test message");
```

If this works, bot is connected but notifications aren't set up correctly.

---

## 🔧 **SOLUTION 9: Check API Endpoints**

Make sure loan platform is triggering notifications:

### When you submit application:
The server should call:
```
POST /api/submit-application
```

This should:
1. Save application to database
2. Send notification to all admins
3. Return success response

**Check server logs for:**
```
📋 Application saved: APP-123
📨 Sending notification to ADMIN001
```

---

## 🔧 **SOLUTION 10: Enable Debug Mode**

Add console logs to see what's happening:

### In server.js, find `sendToAdmin` function:
```javascript
async function sendToAdmin(adminId, message, options = {}) {
    const chatId = adminChatIds.get(adminId);
    
    console.log(`📤 Attempting to send message to admin: ${adminId}`);
    console.log(`   Chat ID: ${chatId}`);
    console.log(`   Message: ${message.substring(0, 50)}...`);
    
    // ... rest of function
}
```

Then restart and watch logs:
```
📤 Attempting to send message to admin: 123456789
   Chat ID: 987654321
   Message: 📋 New Application Received!
```

---

## 🚨 **EMERGENCY: Telegram Bot Not Working At All?**

If NOTHING is working:

### Step 1: Delete old webhook
```bash
# In MongoDB:
db.cameroon_admins.deleteMany({})
```

### Step 2: Restart server
```bash
# Press Ctrl+C to stop
npm start
```

### Step 3: Run `/start` command again
```
Message bot: /start
```

### Step 4: Check logs
```
✅ Bot connected
✅ Webhook CONFIRMED
💓 Keep-alive: 1 admins connected
```

### Step 5: Test again
```
/stats
/myinfo
```

---

## 📋 **Common Issues & Fixes**

| Problem | Cause | Fix |
|---------|-------|-----|
| "❌ Not registered as admin" | Haven't run `/start` | Send `/start` to bot |
| No response to commands | Bot not connected | Check SUPER_ADMIN_BOT_TOKEN in .env |
| Webhook errors | Wrong URL | Check RENDER_EXTERNAL_URL in .env |
| "401 Unauthorized" | Invalid bot token | Get new token from BotFather |
| "403 Forbidden" | Firewall blocking bot | Check network settings |
| No notifications | Admin not in database | Run `/start` again |
| "0 admins connected" | Not registered | Send `/start` command |

---

## ✅ **VERIFICATION: Are Notifications Working?**

### Test 1: Manual Command
```
Send: /stats
Expect: Statistics message back
Result: ✅ Working / ❌ Not working
```

### Test 2: New Application
```
1. Open loan app
2. Submit application
3. Check Telegram for notification
Result: ✅ Working / ❌ Not working
```

### Test 3: Check Logs
```
Run: npm start
Look for: "📨 Sending notification"
Result: ✅ Visible / ❌ Not visible
```

---

## 🎯 **Still Not Working?**

Follow these in order:

1. **Run `/start` in bot** ← Most common fix
2. **Restart server** ← Often fixes issues
3. **Check MongoDB connection** ← Essential
4. **Verify bot token** ← Must be correct
5. **Check firewall** ← Might block webhook
6. **Delete & recreate bot** ← Last resort

---

## 📞 **Get Help**

When asking for help, provide:

1. Bot token (first 20 chars): `123456789:ABC...`
2. Your Admin ID: `123456789`
3. Server logs showing: `✅ Bot connected`
4. Database result of: `db.cameroon_admins.findOne()`
5. Last error message from logs

---

**Questions?** Check the logs first - they usually tell you exactly what's wrong! 🔍

