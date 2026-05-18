# 📅 MONTHLY LOCK ON 1ST - Complete Documentation

## ✅ **SYSTEM LOCKS ON 1ST OF EVERY MONTH**

The system now locks ALL admin links on the **1st of every month** if they haven't paid.

---

## 📅 **Monthly Locking System**

### **How It Works:**

```
Every Month:
  ├─ Days 1-31: Admin has paid, link ACTIVE ✅
  │
  ├─ Day 1 (Midnight): System checks
  │   └─ All admins who didn't pay → LOCKED 🔒
  │
  ├─ Days 2-31: Admin must pay
  │   └─ Cannot get applications
  │   └─ Link is SUSPENDED
  │
  └─ Repeat every month
```

---

## 🔄 **Complete Monthly Cycle**

### **Month of May:**

```
May 1:  System locks all unpaid admins
        ├─ Admins who PAID May 1 → ✅ ACTIVE
        ├─ Admins who DIDN'T PAY → 🔒 LOCKED
        └─ Notifications sent to locked admins

May 2-31: 
        ├─ If admin paid → ✅ Getting applications
        ├─ If admin didn't pay → 🔒 Link locked
        └─ Can still pay anytime

June 1: System locks all unpaid admins AGAIN
        ├─ Only admins who paid in May → ✅ ACTIVE
        ├─ All others → 🔒 LOCKED
        ├─ Notifications sent again
        └─ New payment cycle starts
```

---

## 💰 **Payment Schedule**

### **Monthly Payment Required:**

```
Payment Due: 1st of every month
Amount: 5,000 XAF
Duration: Until end of month

If not paid by 1st:
  🔒 Link automatically LOCKED at midnight
  📧 Admin gets notification
  ❌ Cannot receive applications
  📱 Must pay to unlock
```

---

## 📱 **Admin Experience**

### **Scenario 1: Admin Pays On Time**

```
April 30: Admin pays 5,000 XAF
          Admin: /payment XAF123456
          Super admin: Approves ✅
          Status: paid_this_month

May 1: Midnight check runs
       Admin paid in May? YES
       Result: ✅ ACTIVE
       Applications: Flowing normally

May 31: Month ends, reset happens automatically
```

### **Scenario 2: Admin Doesn't Pay**

```
April 30: Admin doesn't pay anything

May 1: Midnight check runs
       Admin paid in May? NO
       Result: 🔒 LOCKED
       Notification sent: "Payment due"
       Applications: BLOCKED

May 2-15: Admin still hasn't paid
         🔒 Link remains locked
         ❌ No applications

May 15: Admin pays now
        Admin: /payment XAF123456
        Super admin: Approves ✅
        Result: ✅ Link UNLOCKED
        Applications: Resume immediately

May 31: Month ends
```

### **Scenario 3: Admin Forgets**

```
May 1: Midnight - Admin gets locked
       Notification: "Payment due today!"
       Admin: "Oh no! I forgot!"

May 1: Admin pays immediately
       Admin: /payment XAF123456
       Super admin: Approves within minutes
       Admin: Back to ✅ ACTIVE

May 31: Month ends again
```

---

## 🔒 **Locking Mechanism**

### **Every 1st of Month at Midnight:**

```javascript
// Pseudocode of what happens:
if (today === 1st of month) {
    for each admin subscription {
        if (subscription.status !== 'paid_this_month') {
            // Lock the link
            subscription.status = 'suspended'
            subscription.isActive = false
            
            // Send notification
            send_message_to_admin("Your link is locked. Pay to unlock.")
            
            // Block access
            // When user tries to use link -> ERROR
            // "This link is suspended. Admin must pay."
        }
    }
}
```

---

## 📊 **Subscription Status on 1st**

### **Status Changes:**

```
BEFORE 1st (Previous Month):
  ├─ Status: "paid_this_month"
  ├─ isActive: true
  ├─ Link: 🟢 ACTIVE
  └─ Can get: Applications ✅

AFTER 1st (If Paid):
  ├─ Status: "paid_this_month" 
  ├─ isActive: true
  ├─ Link: 🟢 ACTIVE
  └─ Can get: Applications ✅

AFTER 1st (If NOT Paid):
  ├─ Status: "suspended"
  ├─ isActive: false
  ├─ Link: 🔴 LOCKED
  └─ Can get: BLOCKED ❌
```

---

## 📱 **Commands During Lock**

### **What Admin Can Do When Locked:**

```
/subscribe
  → Shows: "Status: SUSPENDED"
           "Payment due: 5,000 XAF"
           "Pay now to unlock"

/payment CODE
  → Sends payment
  → Super admin approves
  → Link unlocks immediately ✅

Other commands:
  → Work, but link remains locked
  → Must pay to get applications
```

---

## 🔓 **Unlocking Process**

### **How to Unlock When Locked:**

```
1. Admin sees link is locked on 1st
   🔒 Cannot get applications

2. Admin pays 5,000 XAF via MTN
   MTN Transfer: 5,000 XAF
   Receives transaction code

3. Admin sends in Telegram
   /payment XAF123456

4. Super admin sees notification
   "Payment received from ADMIN001"

5. Super admin clicks ✅ APPROVE
   System updates status: "paid_this_month"
   System sets isActive: true
   System sends notification to admin

6. Admin gets notification
   ✅ Link is now ACTIVE
   ✅ Applications flowing

7. Admin can immediately start
   Receiving applications again
```

---

## 📅 **Monthly Calendar Example**

### **May - Payment Month**

```
May 1:  🔒 LOCK DAY
        ├─ System locks all unpaid
        ├─ Notifications sent
        ├─ Admins who paid → ✅ ACTIVE
        └─ Admins who didn't pay → 🔒 LOCKED

May 2-31: Payment Period
        ├─ Admins can still pay anytime
        ├─ Pay anytime, link unlocks
        ├─ Super admin approval instant
        └─ Access restored immediately

May 15: Example payment (late)
        ├─ Admin: /payment CODE
        ├─ Super admin: Approves
        ├─ Status: paid_this_month
        └─ Link: ✅ ACTIVE again

May 31: Month ends
        └─ Prepare for June 1 lock

June 1: 🔒 LOCK DAY AGAIN
        ├─ System locks all who didn't pay
        ├─ New notifications sent
        └─ Cycle repeats
```

---

## 🛡️ **Security Features**

### **Cannot Bypass:**

```
✅ Database check
   └─ status field checked
   └─ Must be 'paid_this_month'

✅ API check
   └─ Every application submit checked
   └─ isActive must be true

✅ Webhook check
   └─ Bot cannot send apps if locked
   └─ Rejected at API level

Result: Cannot get around payment
        Payment is MANDATORY every month
```

---

## 📊 **Database Changes**

### **Subscriptions Collection:**

```javascript
{
  "_id": ObjectId("..."),
  "adminId": "123456789",
  "subscriptionStatus": "paid_this_month",  // or "suspended"
  "isActive": true,                         // or false
  "monthlyPaymentAmount": 5000,             // XAF
  "monthlyPaymentDueDate": 1,               // 1st of month
  "lastPaymentDate": "2024-06-01T...",
  "lastPaymentCode": "XAF123456",
  "paymentHistory": [                       // New
    {
      "month": "June",
      "year": 2024,
      "amount": 5000,
      "date": "2024-06-01T...",
      "code": "XAF123456",
      "status": "approved"
    },
    // ... previous months
  ],
  "currentMonthPaid": true,                 // New
  "createdAt": "2024-05-18T...",
  "updatedAt": "2024-06-01T..."
}
```

---

## 📈 **Admin Dashboard View**

### **Monthly Status:**

```
SUBSCRIPTION STATUS
════════════════════════════════════════

Current Month: June 2024
Payment Status: ✅ PAID

Amount Due: 5,000 XAF
Payment Due Date: June 1, 2024
Last Payment: June 1, 2024
Days Until Next Payment: 29 days

Link Status: 🟢 ACTIVE
Getting Applications: YES
Admin Panel: ACCESSIBLE

Payment History:
├─ June 1, 2024:  ✅ APPROVED (5,000 XAF)
├─ May 1, 2024:   ✅ APPROVED (5,000 XAF)
└─ April 1, 2024: ✅ APPROVED (5,000 XAF)
```

---

## 🎯 **Key Features**

✅ **Monthly Requirement**
   └─ Must pay every month
   └─ Every 1st of month check
   └─ Cannot skip

✅ **Fair System**
   └─ All admins locked same day
   └─ Same payment amount (5,000 XAF)
   └─ Same requirements for all

✅ **Automatic Enforcement**
   └─ No manual intervention
   └─ Happens at midnight on 1st
   └─ System checks hourly to ensure

✅ **Quick Reactivation**
   └─ Pay anytime during month
   └─ Instant unlock after approval
   └─ No waiting

✅ **Clear Communication**
   └─ Notifications on lock day
   └─ Clear payment instructions
   └─ Support information included

---

## ⏰ **Check Schedule**

### **System Checks:**

```
Every hour: 
  └─ Look at calendar
  └─ Is today the 1st?
  └─ If YES → Run monthly lock
  └─ If NO → Skip check

So exact timing:
  May 1, 00:00:00 → First check (locks at midnight)
  May 1, 01:00:00 → Second check (already locked)
  May 1, 02:00:00 → Third check (skip, already done)
  ...
  May 2, 00:00:00 → No lock needed, not 1st anymore
```

---

## 💡 **Best Practices**

1. **Clear Due Date Communication**
   - Tell all admins: "Pay on 1st of month"
   - No confusion about when to pay
   - Everyone knows the same date

2. **Fast Approval Process**
   - Super admin approves quickly
   - Link restored immediately
   - Admin happy

3. **Grace Period Option**
   - You can approve payments made late (Feb 5, etc.)
   - But still lock everyone on the 1st
   - Then allow late payments

4. **Payment Reminders** (Optional)
   - Send message on 25th: "Payment due in 6 days"
   - Send message on 30th: "Payment due tomorrow"
   - Reduce missed payments

---

## 🎉 **Summary**

✅ **Monthly Lock on 1st of Month:**
- All admins locked on same date (1st)
- Each month, without fail
- Cannot get applications until paid
- Payment instantly reactivates
- Fair, automatic, foolproof

✅ **No More Individual Dates:**
- NOT 30 days from payment
- NOT different for each admin
- ALL locked on 1st
- ALL must pay by 1st

✅ **Revenue Guaranteed:**
- Every admin pays 5,000 XAF monthly
- Automatic enforcement
- Cannot use without paying
- Secure system

**Perfect for monthly recurring revenue!** 💰

