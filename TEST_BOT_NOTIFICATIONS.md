# 🧪 Telegram Bot - Test Notifications Guide

## ✅ **Testing Telegram Bot Notifications**

Follow these steps to verify bot notifications are working:

---

## **TEST 1: Bot Connection (2 minutes)**

### Step 1: Check Server Logs
```bash
Run: npm start

Look for these messages:
✅ Bot connected: @YourBotName (Bot)
✅ Webhook CONFIRMED: https://your-url/telegram-webhook
💓 Keep-alive: X admins connected
```

**If you see these:** ✅ Bot is connected!
**If you don't see these:** ❌ Bot token is wrong or offline

### Step 2: What each message means

```
✅ Bot connected
   → Bot successfully authenticated with Telegram
   → Your token is valid
   → Connection established

✅ Webhook CONFIRMED
   → Telegram webhook is set correctly
   → Bot knows where to send requests
   → Ready to receive messages

💓 Keep-alive
   → Bot is checking in every 14 minutes
   → Shows X admins are registered
   → If 0 admins, nobody has run /start
```

---

## **TEST 2: Command Responses (2 minutes)**

### Test `/start` command
```
In Telegram:
Message your bot: /start

Expected response:
"👋 Welcome to InnBucks Admin Bot!
Your Admin ID: 123456789
Available commands:
/mylink - Get application link
/stats - View statistics
..."

Result:
✅ Got response = Bot is working!
❌ No response = Bot token is wrong
```

### Test `/stats` command
```
In Telegram:
Message your bot: /stats

Expected response:
"📊 Platform Statistics:
Total Applications: 0
Pending: 0
Approved: 0
Rejected: 0"

Result:
✅ Got response = Bot is working!
❌ No response = Bot not responding
```

### Test `/myinfo` command
```
In Telegram:
Message your bot: /myinfo

Expected response:
"👤 Your Information:
Admin ID: `123456789`
Status: active
Created: [date]
Chat ID: [your chat id]"

Result:
✅ Got response = You're registered!
❌ "Not registered" = Run /start first
```

---

## **TEST 3: Notification on New Application (5 minutes)**

### Step 1: Open Loan App
```
Go to: http://localhost:3000
```

### Step 2: Submit Application
```
1. Click "START APPLICATION"
2. Fill all form fields:
   - Loan Type: Personal Loan
   - Amount: 1,000,000 XAF
   - Term: 48 Months
   - Purpose: Test
3. First Name: John
4. Last Name: Doe
5. Phone: 670123456
6. Employment: Employed
7. Annual Income: 5,000,000
8. Click "SUBMIT APPLICATION"
```

### Step 3: Check for Notification
```
Open Telegram
Check your bot messages

You should see:
"📋 New Application Received!

Applicant: John Doe
Phone: +237670123456
Loan Amount: 1,000,000 XAF
Loan Term: 48 Months
Status: Pending Admin Approval

👉 Click to review application"
```

**Result:**
- ✅ Got notification = Notifications working!
- ❌ No notification = See "Troubleshooting" below

---

## **TEST 4: Admin Notifications (3 minutes)**

### Step 1: Submit Application
```
(Same as TEST 3 above)
```

### Step 2: Check Server Logs
```
Watch the console where npm start is running

You should see:
"📨 Sending notification to ADMIN001"
"📨 Sending notification to ADMIN002"
"✅ Notification sent successfully"

OR error messages like:
"❌ No chat ID for admin"
"❌ Error sending to admin"
```

**Result:**
- ✅ "Notification sent" = Working!
- ❌ "No chat ID" = Admin not registered
- ❌ "Error sending" = Bot connection problem

---

## **TEST 5: Check Database (2 minutes)**

### Step 1: Open MongoDB
```
Use MongoDB Compass or mongosh

Database: Cameroon
Collection: cameroon_admins
```

### Step 2: Check Your Record
```
Query:
db.cameroon_admins.findOne({})

You should see:
{
  "_id": ObjectId("..."),
  "adminId": "123456789",
  "chatId": 987654321,
  "status": "active",
  "email": "your@email.com",
  "createdAt": "2024-05-18T10:30:00Z"
}
```

**What each field means:**
- `adminId` = Your ID
- `chatId` = Your Telegram chat ID (used to send messages)
- `status` = "active" (ready to receive notifications)
- `email` = Your email (optional)

**Result:**
- ✅ Record exists with status "active" = Good!
- ❌ Record doesn't exist = Run `/start` command
- ❌ Status is "paused" = Run `/resume` command

---

## **TEST 6: Complete Workflow Test (10 minutes)**

Do all these in order:

```
1. ✅ Restart server
   Ctrl+C
   npm start

2. ✅ Send /start in bot
   Wait for response
   Save Admin ID

3. ✅ Test /stats command
   Should get statistics

4. ✅ Test /myinfo command
   Should see your info

5. ✅ Submit application in loan app
   Fill form completely
   Click submit

6. ✅ Check for notification
   Look in Telegram
   Should see new app notification

7. ✅ Check server logs
   Should show "Notification sent"

8. ✅ Check database
   Should see admin record
   Status should be "active"
```

**If ALL steps work:** ✅ Notifications are working perfectly!

---

## **TEST 7: Check Webhook (Advanced)**

### Step 1: Make POST request to webhook
```bash
curl -X POST http://localhost:3000/telegram-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "update_id": 123456789,
    "message": {
      "message_id": 1,
      "date": 1234567890,
      "chat": {
        "id": 123456789,
        "type": "private"
      },
      "from": {
        "id": 123456789,
        "is_bot": false,
        "first_name": "Test"
      },
      "text": "/stats"
    }
  }'
```

### Step 2: Check Response
```
Should get:
HTTP 200 OK
```

### Step 3: Check Logs
```
Should see:
"📥 Webhook received"
"✅ Update processed"
```

---

## **Troubleshooting Test Results**

### ❌ TEST 1 Failed (Bot not connected)
**Error:** "❌ Bot error" or no bot messages in logs

**Fix:**
1. Check SUPER_ADMIN_BOT_TOKEN in .env
2. Verify token with BotFather
3. Make sure no extra spaces
4. Restart server

### ❌ TEST 2 Failed (Commands not responding)
**Error:** Bot doesn't respond to /start or /stats

**Fix:**
1. Make sure you sent message to correct bot
2. Check bot is running (see TEST 1 logs)
3. Run `/start` command again
4. Wait 5 seconds before next command

### ❌ TEST 3 Failed (No notification on app submit)
**Error:** Submitted application but got no Telegram message

**Fix:**
1. Did you run `/start`? (Required!)
2. Check server logs for "Notification sent"
3. Check MongoDB for your admin record
4. Make sure status is "active" not "paused"

### ❌ TEST 4 Failed (Server logs show errors)
**Error:** "❌ No chat ID" or "❌ Error sending"

**Fix:**
1. Run `/start` to register
2. Check you're in database
3. Verify chatId is correct
4. Restart server

### ❌ TEST 5 Failed (Not in database)
**Error:** adminId record not found in MongoDB

**Fix:**
1. Run `/start` command
2. Wait for bot response
3. Check database again
4. If still not there, check server logs for errors

### ❌ TEST 6 Failed (Workflow incomplete)
**Error:** Some steps work, others don't

**Fix:**
1. Identify which step failed
2. See fixes above for that step
3. Try again from that step

### ❌ TEST 7 Failed (Webhook error)
**Error:** Webhook returns error or no response

**Fix:**
1. Check webhook URL is correct
2. Make sure server is running
3. Check firewall isn't blocking
4. Restart server

---

## **Quick Reference: Command Tests**

| Command | Expected Response | Status |
|---------|------------------|--------|
| `/start` | Welcome + Admin ID | ✅ or ❌ |
| `/stats` | Statistics | ✅ or ❌ |
| `/myinfo` | Your info | ✅ or ❌ |
| `/mylink` | Referral link | ✅ or ❌ |
| `/pending` | Pending apps | ✅ or ❌ |

---

## **What to Check in Order**

If notifications don't work:

1. **Check bot is connected**
   - Look for "✅ Bot connected" in logs
   - If not there, token is wrong

2. **Check you're registered**
   - Run `/start` in bot
   - You should get Admin ID
   - If not, see logs for errors

3. **Check you're in database**
   - Query cameroon_admins collection
   - Find your adminId
   - Status must be "active"

4. **Check server sends notification**
   - Submit application
   - Watch logs for "Notification sent"
   - If not there, see logs for errors

5. **Check Telegram receives message**
   - Look in Telegram inbox
   - Message should appear
   - If not, bot connection issue

---

## **Final Verification Checklist**

- [ ] Bot token in .env is valid
- [ ] Server shows "✅ Bot connected"
- [ ] I've sent `/start` to bot
- [ ] Bot responded to `/start`
- [ ] `/stats` command works
- [ ] I'm in database with status "active"
- [ ] Can submit test application
- [ ] Got notification in Telegram
- [ ] Logs show "Notification sent"

If all checked ✅ → Notifications are working!

---

**The most common issue: Forgetting to run `/start`!** Just send `/start` to bot first! 🤖

