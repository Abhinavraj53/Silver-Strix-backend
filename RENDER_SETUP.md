# Render Backend Deployment - Step by Step

## ⚠️ IMPORTANT: Render Dashboard Settings

Jab aap Render pe service create kar rahe ho, **yeh settings zaroor set karein:**

### 1. Basic Settings Tab

```
Name: pujnam-store-backend
Region: Choose closest region
Branch: main
Root Directory: backend          ← YEH BOHOT IMPORTANT HAI!
Runtime: Node
```

### 2. Build & Deploy Tab

```
Build Command: npm install        ← Root directory automatically "backend" hoga
Start Command: npm start          ← Root directory automatically "backend" hoga
```

**Ya phir explicitly:**
```
Build Command: cd backend && npm install
Start Command: cd backend && npm start
```

### 3. Environment Variables Tab

Add these variables:

```
MONGODB_URI = mongodb+srv://username:password@cluster.mongodb.net/dbname
JWT_SECRET = your-long-random-secret-key-here
EMAIL_USER = your-email@gmail.com (optional)
EMAIL_PASSWORD = your-gmail-app-password (optional)
FREE_ASTROLOGY_API_KEY = your-key (optional)
```

### 4. Advanced Settings (Optional)

```
Auto-Deploy: Yes
Health Check Path: /api/health
```

## ✅ Verification Checklist

Before clicking "Create Web Service", verify:

- [ ] **Root Directory** is set to `backend` (NOT empty, NOT root)
- [ ] **Build Command** is `npm install` (will run in backend folder)
- [ ] **Start Command** is `npm start` (will run in backend folder)
- [ ] All environment variables are added
- [ ] MongoDB Atlas IP whitelist includes `0.0.0.0/0`

## 🚨 Common Mistakes

### Mistake 1: Root Directory Empty
❌ **Wrong:** Root Directory = (empty)
✅ **Correct:** Root Directory = `backend`

### Mistake 2: Wrong Build Command
❌ **Wrong:** `npm run build` (frontend command)
✅ **Correct:** `npm install` (backend dependencies)

### Mistake 3: Wrong Start Command
❌ **Wrong:** `npm run dev` or `vite` (frontend commands)
✅ **Correct:** `npm start` (backend command)

## 📝 Render Dashboard Screenshot Guide

When creating service, you should see:

```
┌─────────────────────────────────────┐
│ Name: pujnam-store-backend          │
│ Region: [Select]                    │
│ Branch: main                        │
│ Root Directory: backend  ← YEH!    │
│ Runtime: Node                       │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Build Command: npm install          │
│ Start Command: npm start           │
└─────────────────────────────────────┘
```

## 🔧 If Still Getting Port Error

1. **Check Root Directory:**
   - Go to Settings → General
   - Verify "Root Directory" = `backend`

2. **Check Start Command:**
   - Go to Settings → Build & Deploy
   - Verify "Start Command" = `npm start`
   - Should NOT be `npm run dev` or `vite`

3. **Manual Deploy:**
   - Go to Manual Deploy
   - Select "Clear build cache & deploy"

## ✅ After Successful Deployment

Your backend URL will be:
```
https://pujnam-store-backend.onrender.com
```

Test it:
```
https://pujnam-store-backend.onrender.com/api/health
```

Should return:
```json
{"status":"ok","message":"SIlver Strix API is running"}
```

## 📞 Still Having Issues?

1. Check Render logs: Dashboard → Your Service → Logs
2. Verify backend/server.js has: `app.listen(PORT, '0.0.0.0', ...)`
3. Make sure Root Directory is `backend` (not empty!)
