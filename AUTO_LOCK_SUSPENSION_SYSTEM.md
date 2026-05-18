# 🔒 AUTO-LOCK SYSTEM - Complete Documentation

## ✅ **YES - Links Auto-Lock When Subscription Expires!**

The system automatically locks admin links when subscriptions expire. This happens automatically every hour.

---

## 🔄 **How Auto-Lock Works**

### **Timeline:**

```
Day 1-7:        FREE TRIAL
                ✅ Link ACTIVE
                ✅ Getting applications
                ✅ Full access

Day 8 (00:00):  TRIAL ENDS
                ⚠️ Warning sent to admin
                ✅ Link still ACTIVE (24-hour grace)

Day 8-9:        GRACE PERIOD
                ✅ Link ACTIVE
                ⏳ Admin must pay now!
                ⚠️ Repeated warnings sent

Day 9 (Every Hour): AUTO-LOCK CHECK
                🔒 System checks every 60 minutes
                🔒 If expired & not paid → LOCK LINK
                📧 Admin gets notification
                ❌ Link is now SUSPENDED
                ❌ No more applications sent

Day 10+:        LINK LOCKED
                🔒 Link is INACTIVE
                ❌ No new applications
                ❌ Cannot access admin panel
                📱 Must pay to unlock
```

---

## ⏰ **Auto-Lock Schedule**

### **Timing:**
```
Check Frequency:  Every 60 minutes (every hour)
Check Time:       Server automatically checks hourly
Timezone:         Server timezone (UTC+1 for Cameroon)
Lock Action:      Automatic if subscription expired
```

### **What Happens Every Hour:**

```javascript
// Every 60 minutes (60 * 60 * 1000 milliseconds):
setInterval(async () => {
    // 1. Get all subscriptions from database
    // 2. Check which ones expired
    // 3. Auto-lock expired ones
    // 4. Send notifications to admins
    // 5. Update database status to "suspended"
    // 6. Log results in server console
}, 60 * 60 * 1000); // Every hour
```

---

## 🔒 **Auto-Lock Process**

### **Step 1: System Checks Every Hour**
```
00:00 - Check subscriptions
01:00 - Check subscriptions
02:00 - Check subscriptions
03:00 - Check subscriptions
... (continues every hour)
```

### **Step 2: Find Expired Subscriptions**
```
Database query:
SELECT * FROM subscriptions
WHERE expiryDate < NOW()
AND status = 'active'
```

### **Step 3: Lock the Link**
```
For each expired subscription:
1. Set status = 'suspended'
2. Set isActive = false
3. Update timestamp
4. Save to database
```

### **Step 4: Notify Admin**
```
Send Telegram message:
⚠️ SUBSCRIPTION EXPIRED

Your subscription has expired and your link is now suspended.

💰 Amount Due: 5,000 XAF

📱 Send payment to:
MTN Mobile Money / Orange Money
Account: Cameroon number
Name: Elphaz Rotich

After sending payment, use command:
/payment <TRANSACTION_CODE>

Example: /payment XAF123456
```

### **Step 5: Block Access**
```
When user tries to access suspended link:
❌ Application rejected
❌ Error message shown
📱 Message: "This link is currently suspended. 
   The admin needs to pay the subscription fee 
   to reactivate it."
```

---

## 📊 **Subscription Status Changes**

### **Status Timeline:**

```
ACTIVE (Days 1-30)
├─ Expiry date: Future date
├─ Days remaining: > 0
├─ Link status: 🟢 ACTIVE
├─ Can get apps: YES
└─ Action: None needed

EXPIRING SOON (Days 29-30)
├─ 1 day remaining
├─ Link status: 🟡 WARNING
├─ Notification sent: YES
├─ Can get apps: YES
└─ Action: Must pay soon!

EXPIRED (After day 30 + 1 hour check)
├─ Expiry date: Past date
├─ Days remaining: 0 or negative
├─ Link status: 🔴 SUSPENDED
├─ Can get apps: NO
└─ Action: Must pay now!

SUSPENDED (After day 30 + 1 hour check)
├─ Database status: "suspended"
├─ isActive: false
├─ Link status: 🔴 LOCKED
├─ Can get apps: NO
└─ Action: Pay to reactivate
```

---

## 🛡️ **How System Blocks Locked Links**

### **When User Submits Application with Locked Link:**

```javascript
// In server.js - Line 1684
if (!subscription || subscription.subscriptionStatus === 'suspended') {
    return res.status(403).json({
        success: false,
        message: 'This link is currently suspended. 
                  The admin needs to pay the subscription fee 
                  to reactivate it.'
    });
}
```

### **Result for User:**
```
User sees error message:
"❌ This link is suspended"

Loan application NOT saved
No notification sent to admin
User redirected back
Cannot proceed
```

---

## 📱 **Auto-Lock Notifications**

### **Notification 1: Trial Ending Soon (Day 7)**
```
⚠️ SUBSCRIPTION EXPIRING SOON

Days Remaining: 1 day
Expiry Date: [date and time]

Your free trial is ending soon!
To continue receiving applications,
please pay the subscription fee.

Amount Due: 5,000 XAF
```

### **Notification 2: Link Suspended (When Locked)**
```
⚠️ SUBSCRIPTION EXPIRED

Your subscription has expired and your link is now suspended.

💰 Amount Due: 5,000 XAF

📱 Send payment to:
MTN Mobile Money / Orange Money
Account: Cameroon number

After payment:
/payment <TRANSACTION_CODE>
```

### **Notification 3: Payment Reminder (Every Hour)**
```
If still suspended:
🔒 Your link is still LOCKED

To reactivate:
1. Send 5,000 XAF via MTN
2. Use /payment CODE
3. Wait for admin approval

Questions? Contact support.
```

---

## 🔧 **Database Lock Mechanism**

### **Subscriptions Table:**
```javascript
{
  _id: ObjectId(...),
  adminId: "123456789",
  subscriptionStatus: "suspended",    // ← Changed from "active"
  expiryDate: "2024-05-18T10:30:00Z", // ← Now in past
  isActive: false,                     // ← Flag set to false
  updatedAt: "2024-05-18T10:30:00Z",  // ← Updated timestamp
  daysRemaining: -5,                   // ← Negative (expired)
  status: "suspended"                  // ← Status updated
}
```

### **Application Check:**
```javascript
// When user submits application with admin's link:
// Server checks:
if (subscription.subscriptionStatus === 'suspended' ||
    subscription.isActive === false ||
    subscription.expiryDate < NOW()) {
    
    // REJECT the application
    return ERROR("Link is suspended");
}
```

---

## ⏱️ **Automatic Check Schedule**

### **Current Schedule: Every Hour**
```
60 * 60 * 1000 milliseconds = 60 minutes = 1 hour

Checks happen at:
- 12:00 AM
- 1:00 AM
- 2:00 AM
- 3:00 AM
... and so on, every hour automatically
```

### **Can Be Changed:**
```javascript
// In server.js, change this value:
}, 60 * 60 * 1000);  // 1 hour

// To check more frequently:
}, 30 * 60 * 1000);  // Every 30 minutes
}, 15 * 60 * 1000);  // Every 15 minutes

// To check less frequently:
}, 24 * 60 * 60 * 1000);  // Every 24 hours (daily)
```

---

## 🚨 **What Happens When Link is Locked**

### **For User Submitting Application:**
```
User enters referral link
↓
Clicks "START APPLICATION"
↓
Submits application form
↓
Server checks subscription status
↓
Subscription is SUSPENDED
↓
❌ Application REJECTED
↓
Error shown: "This link is suspended"
↓
Application NOT saved
↓
Admin does NOT get notification
↓
User is blocked
```

### **For Admin:**
```
Subscription expires
↓
Every hour check runs
↓
System finds expired subscription
↓
🔒 Link is automatically locked
↓
❌ No more applications received
↓
Admin gets notification: "Link suspended"
↓
Admin cannot access admin panel
↓
Admin cannot use bot commands effectively
↓
(Can still use some commands like /payment)
```

### **For Super Admin:**
```
Sees notification: Payment received
↓
Checks amount (5,000 XAF)
↓
Clicks ✅ APPROVE
↓
System unlocks link
↓
Admin's subscription reactivated
↓
Link becomes ACTIVE
↓
Applications start flowing again
```

---

## 🔓 **Unlocking a Suspended Link**

### **How to Unlock:**

```
1. Admin pays 5,000 XAF via MTN
2. Admin sends: /payment TRANSACTION_CODE
3. Super admin receives notification
4. Super admin clicks ✅ APPROVE
5. System runs:
   - Set status = 'active'
   - Set isActive = true
   - Set expiryDate = NOW + 30 days
   - Update database
6. ✅ Link immediately unlocked
7. Applications start arriving again
```

### **Manual Unlock (Super Admin):**
```
If admin has valid issue:
1. Super admin finds subscription in database
2. Sets status = 'active'
3. Sets isActive = true
4. Sets expiryDate = NOW + 30 days
5. Saves changes
6. Link is unlocked
7. Admin gets notification
```

---

## 📊 **Suspension Statistics**

### **Track Suspended Links:**
```
Database query:
SELECT COUNT(*) FROM subscriptions
WHERE subscriptionStatus = 'suspended'

Results show:
- How many links are suspended
- Which admins need to pay
- How much revenue pending
- Revenue lost from suspended
```

---

## 🎯 **Benefits of Auto-Lock System**

✅ **Automatic Enforcement**
   └─ No manual work needed
   └─ Happens every hour
   └─ No human error

✅ **Revenue Protection**
   └─ Cannot use service without paying
   └─ Prevents unpaid access
   └─ Ensures payment compliance

✅ **Fair System**
   └─ All admins treated equally
   └─ Same expiry rules for all
   └─ Automatic, no favoritism

✅ **Easy Reactivation**
   └─ Just pay and approve
   └─ Instant unlock
   └─ Access restored immediately

✅ **Clear Communication**
   └─ Admin notified when locked
   └─ Told exactly how to fix it
   └─ Support information included

---

## ⚠️ **Important Notes**

### **The auto-lock is NOT on a specific date:**
```
❌ NOT: "Always locks on the 1st of month"
✅ YES: "Locks after 30 days from subscription date"

Example:
- Admin subscribes: May 18
- Subscription expires: June 18 (exactly 30 days later)
- Link locked: June 18 + next hourly check
```

### **The auto-lock checks every hour:**
```
So if subscription expires at 10:30 AM:
- 10:30 AM: Expires
- 11:00 AM: Next hourly check detects it
- 11:00 AM: Link gets locked

Not instant, but within 60 minutes max
```

### **The lock is enforced at application level:**
```
Even if user somehow bypasses frontend:
- Direct API call with suspended link
- POST /api/submit-application
- Server checks subscription status
- Application rejected at server level
- Cannot bypass security
```

---

## 🔧 **Server Log Examples**

### **When Auto-Lock Happens:**
```
12:00:00 🔒 Checking for expired subscriptions...
12:00:01 Found 5 expired subscription(s)
12:00:02 🔒 Suspended 5 expired subscription(s)
12:00:03 📧 Sending notifications to 5 admins...
12:00:05 ✅ All notifications sent
```

### **When User Tries Locked Link:**
```
12:15:23 POST /api/submit-application
12:15:24 ❌ Subscription status: suspended
12:15:24 ❌ Application rejected: Link is suspended
12:15:25 Response: 403 Forbidden
```

### **When Link is Unlocked:**
```
12:30:00 Admin approved: Payment for ADMIN001
12:30:01 ✅ Subscription reactivated
12:30:02 📧 Notification sent to admin
12:30:03 Link is now ACTIVE
```

---

## 📋 **Checklist: Auto-Lock System**

- [ ] System checks every 60 minutes
- [ ] Expired subscriptions automatically locked
- [ ] Admins get notification when locked
- [ ] Locked links reject new applications
- [ ] Users get error message "Link suspended"
- [ ] Applications NOT saved if link suspended
- [ ] Admin notifications NOT sent if link suspended
- [ ] Payment reactivates link instantly
- [ ] Super admin approval unlocks link
- [ ] System logs all lock/unlock events
- [ ] Database status updated automatically
- [ ] Multiple checks prevent bypass

---

## 🎉 **Summary**

✅ **Auto-Lock Works:**
- Every 60 minutes (every hour)
- Based on subscription expiry date (30 days from payment)
- Automatic, no manual intervention needed
- Blocks new applications immediately
- Prevents unpaid access
- Easy to reactivate by paying

✅ **NOT locked on specific date:**
- Locked based on individual subscription date
- Different for each admin
- 30 days from their payment date
- Then checked hourly for auto-lock

✅ **Very Secure:**
- Database level check
- API level check
- Cannot bypass with URL tricks
- Enforced at application submission

**The system is fully automated and foolproof!** 🔒

