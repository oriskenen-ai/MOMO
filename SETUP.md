# MTN MoMo Loans Platform - Setup Guide

## 📋 Quick Setup (5 Minutes)

### Step 1: Install Node.js
If you don't have Node.js installed:
- Download from https://nodejs.org (version 18 or higher)
- Install and verify: `node --version`

### Step 2: Install Dependencies
```bash
npm install
```

This installs:
- `express` - Web server framework
- `mongodb` - Database driver
- `dotenv` - Environment configuration

### Step 3: Setup Environment Variables

**Copy the template:**
```bash
cp .env.example .env
```

**Edit the .env file** and add your MongoDB connection string:
```
MONGODB_URI=mongodb+srv://your_username:your_password@cluster.mongodb.net/mtn_momo_loans?retryWrites=true&w=majority
PORT=3000
NODE_ENV=development
```

### Step 4: Start the Server
```bash
npm start
```

You should see:
```
✅ MTN MoMo Loans Platform - Server Running
🌐 http://localhost:3000
📊 Database: ✅ Connected
```

### Step 5: Open in Browser
```
http://localhost:3000
```

## 🧪 Test the Application

### Demo Credentials (Any of these work)
```
Phone:  670123456 (9 digits)
        690123456
        650123456
        (any 9-digit number)

PIN:    12345 (5 digits)
        (any 5-digit combination)

OTP:    1234 (4 digits)
        (any 4-digit combination)

SMS:    "Your MTN MoMo verification code is: 123456"
        (or any message containing code/verification)
```

## 📱 Complete User Journey

```
1. Landing Page
   → Click "START APPLICATION"

2. Application Form (3 Steps)
   → Fill in loan details, personal info, financial info

3. Processing
   → Wait for 2-3 seconds

4. Login Page
   → Enter phone: 670123456
   → Enter PIN: 12345
   → Click LOGIN

5. SMS Verification
   → Paste: "Your MTN MoMo verification code is: 123456"
   → Click SUBMIT

6. Wait for Approval
   → Watch animated approval screen

7. OTP Verification
   → Enter PIN: 12345
   → Enter OTP: 1234
   → Click VERIFY & APPROVE LOAN

8. Loan Approved
   → See success page with loan details
```

## 🔧 Development Commands

```bash
# Start server (production mode)
npm start

# Start with auto-reload (requires nodemon)
npm run dev

# Clean database - delete all applications
npm run clean:apps

# Clean database - delete all admins
npm run clean:admins

# Clean database - delete everything
npm run clean:all
```

## 📂 Project Files

```
├── index.html          Main UI (HTML/CSS/JavaScript)
├── server.js           Express.js backend API
├── database.js         MongoDB operations
├── package.json        Project dependencies
├── .env                Configuration (create from .env.example)
├── .env.example        Configuration template
├── cleanup.js          Database cleanup utility
└── README.md           Full documentation
```

## 🗄️ Setting Up MongoDB

### Option 1: MongoDB Atlas (Cloud) - Recommended

1. Go to https://www.mongodb.com/cloud/atlas
2. Create a free account
3. Create a new project
4. Create a cluster (select Free Tier)
5. Create a database user
6. Get connection string:
   - Click "Connect"
   - Choose "Connect your application"
   - Copy the connection string
   - Replace `<password>` with your database user password
   - Replace `myFirstDatabase` with `mtn_momo_loans`

7. Paste into `.env` file as `MONGODB_URI`

### Option 2: Local MongoDB

1. Download MongoDB from https://www.mongodb.com/try/download/community
2. Install and start MongoDB
3. In `.env`, use:
   ```
   MONGODB_URI=mongodb://localhost:27017/mtn_momo_loans
   ```

## 🐛 Troubleshooting

### Issue: "Cannot find module 'express'"
**Solution:**
```bash
npm install
```

### Issue: "MONGODB_URI is not set"
**Solution:**
- Check that `.env` file exists
- Check that `MONGODB_URI` is set correctly
- Restart the server: `npm start`

### Issue: "Cannot connect to MongoDB"
**Solution:**
- Verify MongoDB URI is correct
- Check network connectivity
- If using MongoDB Atlas:
  - Verify IP whitelist includes your IP
  - Verify database user credentials
  - Check connection string has correct password (no special chars)

### Issue: Port 3000 is already in use
**Solution:**
```bash
PORT=3001 npm start
```

### Issue: "Cannot GET /"
**Solution:**
- Make sure you're accessing http://localhost:3000 (not localhost:3000/)
- Check that Express server is running
- Check browser console for errors (F12)

## 🌍 Custom Configuration

### Change Port
Edit `.env`:
```
PORT=8080
```
Then restart: `npm start`

### Change Database Name
Edit `database.js`, line 7:
```javascript
const DB_NAME = 'mtn_momo_loans';  // Change this
```

### Change Country Code
In `index.html`, search for `+237` and replace with your country code

### Change Currency
In `index.html`, search for `XAF` and replace with your currency

## ✅ Checklist

- [ ] Node.js 18+ installed
- [ ] MongoDB account created (Atlas or local)
- [ ] `.env` file created with MONGODB_URI
- [ ] `npm install` completed
- [ ] `npm start` runs without errors
- [ ] Can access http://localhost:3000
- [ ] Test flow works with demo credentials
- [ ] No console errors (F12)

## 📚 Next Steps

1. **Test the app** - Use demo credentials above
2. **Customize** - Change colors, text, currency as needed
3. **Integrate APIs** - Connect real MTN MoMo API
4. **Deploy** - See DEPLOYMENT.md for options
5. **Monitor** - Check logs and database

## 🚀 Ready to Go!

Your MTN MoMo Loans platform is now running locally!

```bash
npm start
# Open http://localhost:3000
```

---

**Questions?** Check README.md or QUICKREF.md

**Need help?** Check the error message in the browser console (F12)

Happy coding! 🎉
