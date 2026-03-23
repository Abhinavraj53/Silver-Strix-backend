const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const PendingRegistration = require('../models/PendingRegistration');
const Order = require('../models/Order');
const TempPassword = require('../models/TempPassword');
const { auth } = require('../middleware/auth');
const { sendEmail } = require('../utils/emailService');

const router = express.Router();

// Generate 6-digit verification code
const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const hasCompleteShippingAddress = (shippingAddress) => {
    if (!shippingAddress) return false;

    return Boolean(
        shippingAddress.address &&
        shippingAddress.phone &&
        shippingAddress.city &&
        shippingAddress.state &&
        shippingAddress.pincode
    );
};

// Send verification email using email service (Resend, Hostinger, or Gmail)
const sendVerificationEmail = async (email, code, purpose = 'verify') => {
    try {
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; background:#ffffff; border-radius:12px; overflow:hidden;">
                <div style="background:#0a1f44; color:#fff; padding:24px;">
                    <h2 style="margin:0; font-size:24px;">Silver Strix</h2>
                    <p style="margin:4px 0 0 0; opacity:0.9;">Fragrance for every journey</p>
                </div>
                <div style="padding:28px;">
                    <p style="margin:0 0 12px 0; color:#111827; font-size:16px;">${purpose === 'login' ? 'Your login OTP' : 'Verify your email'}:</p>
                    <div style="background:#f3f4f6; padding:20px; text-align:center; letter-spacing:8px; font-size:32px; font-weight:700; color:#0a1f44; border-radius:10px;">
                        ${code}
                    </div>
                    <p style="margin:16px 0 8px 0; color:#374151;">This code expires in <strong>10 minutes</strong>.</p>
                    <p style="margin:0; color:#6b7280; font-size:13px;">If you didn’t request this, you can safely ignore this email.</p>
                </div>
                <div style="padding:16px 24px; background:#f9fafb; color:#6b7280; font-size:12px; text-align:center;">
                    © ${new Date().getFullYear()} Silver Strix. All rights reserved.
                </div>
            </div>
        `;
        
        console.log(`📧 Sending verification email to ${email}`);
        await sendEmail({
            to: email,
            subject: purpose === 'login' ? 'Your Silver Strix login OTP' : 'Verify your email - Silver Strix',
            html: html
        });
        
        console.log(`✅ Verification email sent successfully to ${email}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to send verification email to ${email}:`, error.message);
        console.error('Full error:', error);
        return false;
    }
};

// Send welcome email to newly registered user
const sendWelcomeEmail = async (email, name, plainPassword) => {
    try {
        const Settings = require('../models/Settings');
        const storeSettings = await Settings.getSettings();
        const storeName = storeSettings.storeName || 'Silver Strix';
        const storeEmail = process.env.BREVO_SENDER_EMAIL || storeSettings.storeEmail || 'hello@silverstrix.com';
        const storePhone = storeSettings.storePhone || '';
        const storeAddress = storeSettings.storeAddress || '';

        const html = `
            <div style="font-family: 'Inter', Arial, sans-serif; max-width: 640px; margin: 0 auto; background: #0b1224; color: #0f172a;">
                <div style="background: radial-gradient(circle at 20% 20%, #1f2c4f 0, #0b1224 60%), linear-gradient(120deg, #0b1224, #0f1b39); padding: 42px 36px; text-align: left;">
                    <img src="${storeSettings.logo || 'https://silverstrix.com/logo.png'}" alt="${storeName}" style="height: 40px; display:block; margin-bottom: 22px;">
                    <h1 style="color: #f7f8fb; margin: 0 0 10px 0; font-size: 30px; font-weight: 800; letter-spacing: 0.4px;">Welcome to ${storeName}</h1>
                    <p style="color: #c7d2fe; margin: 0; font-size: 15px;">Fragrance for every journey · Crafted with devotion</p>
                </div>
                
                <div style="background:#ffffff; padding: 38px 34px;">
                    <p style="margin: 0 0 12px 0; font-size: 15px; color: #111827;">Hi ${name || 'there'},</p>
                    <p style="margin: 0 0 14px 0; font-size: 15px; color: #374151; line-height: 1.65;">
                        Thank you for joining <strong>${storeName}</strong>. You now have early access to our signature attars, oils, and puja essentials curated by artisans across India.
                    </p>
                    <div style="background:#f8fafc; border:1px solid #e5e7eb; border-radius: 12px; padding: 18px 20px; margin: 20px 0;">
                        <p style="margin: 0 0 6px 0; color:#0f172a; font-weight: 600;">Your login details</p>
                        <p style="margin: 4px 0; color:#111827;">Email: <strong>${email}</strong></p>
                        ${plainPassword ? `<p style="margin: 4px 0; color:#111827;">Password: <strong>${plainPassword}</strong></p>` : ''}
                        <p style="margin: 10px 0 0 0; color:#6b7280; font-size: 13px;">Keep these safe. You can change your password anytime from your account.</p>
                        <div style="margin-top:12px;">
                            <a href="${(process.env.FRONTEND_URL || 'https://pujnamstore.com')}/reset-password?email=${encodeURIComponent(email)}" style="color:#f97316; font-weight:600; text-decoration:none;">Reset your password</a>
                        </div>
                    </div>
                    <div style="text-align: center; margin: 28px 0;">
                        <a href="${process.env.FRONTEND_URL || 'https://pujnamstore.com'}" 
                           style="display: inline-block; background: linear-gradient(120deg,#f59e0b,#f97316); color: #0b1224; padding: 14px 38px; text-decoration: none; border-radius: 999px; font-weight: 700; font-size: 15px; box-shadow: 0 12px 30px rgba(249,115,22,0.22);">
                            Browse new arrivals
                        </a>
                    </div>
                    <div style="border-top:1px solid #e5e7eb; padding-top: 16px;">
                        <p style="margin: 0 0 10px 0; color:#111827; font-weight: 600;">What to explore first</p>
                        <ul style="margin: 0; padding-left: 18px; color:#4b5563; line-height: 1.7; font-size: 14px;">
                            <li>Discover signature attars inspired by sacred journeys</li>
                            <li>Pick puja kits curated by temple priests</li>
                            <li>Track lightning-fast delivery across India</li>
                        </ul>
                    </div>
                    <p style="margin: 22px 0 0 0; font-size: 15px; color:#374151; line-height:1.65;">
                        If you need any help, just reply to this email or call us. We're always here to guide you.
                    </p>
                    <p style="margin: 16px 0 0 0; font-size: 15px; color:#0f172a; font-weight: 700;">With gratitude,<br>The ${storeName} Team</p>
                </div>
                
                <div style="padding: 18px 24px; background:#0f172a; color:#cbd5f5; text-align:center; font-size:12px;">
                    ${storeEmail ? `<p style="margin:4px 0;">Email: ${storeEmail}</p>` : ''}
                    ${storePhone ? `<p style="margin:4px 0;">Phone: ${storePhone}</p>` : ''}
                    ${storeAddress ? `<p style="margin:4px 0;">Address: ${storeAddress}</p>` : ''}
                    <p style="margin:12px 0 0 0;">© ${new Date().getFullYear()} ${storeName}. All rights reserved.</p>
                </div>
            </div>
        `;
        
        console.log(`📧 Sending welcome email to ${email} via Brevo`);
        let sent = false;

        // Try Brevo first (primary)
        try {
            await sendEmail({
                to: email,
                subject: `Welcome to ${storeName}! Your Account is Ready 🎉`,
                html: html,
                from: storeEmail,
                provider: 'brevo'
            });
            sent = true;
            console.log(`✅ Welcome email sent via Brevo to ${email}`);
        } catch (brevoError) {
            console.error(`❌ Brevo welcome email failed for ${email}:`, brevoError.message || brevoError);
            // Fallback to Mailgun if configured
            if (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN) {
                try {
                    console.log(`🔁 Falling back to Mailgun for ${email}`);
                    await sendEmail({
                        to: email,
                        subject: `Welcome to ${storeName}! Your Account is Ready 🎉`,
                        html: html,
                        from: storeEmail,
                        provider: 'mailgun'
                    });
                    sent = true;
                    console.log(`✅ Welcome email sent via Mailgun to ${email}`);
                } catch (mgError) {
                    console.error(`❌ Mailgun fallback failed for ${email}:`, mgError.message || mgError);
                }
            }
        }
        
        return sent;
    } catch (error) {
        console.error(`❌ Failed to send welcome email to ${email}:`, error.message);
        console.error('Full error:', error);
        return false;
    }
};

// Send password reset OTP email using transactional provider
const sendPasswordResetOTP = async (email, code) => {
    try {
        const Settings = require('../models/Settings');
        const storeSettings = await Settings.getSettings();
        const storeName = storeSettings.storeName || 'SIlver Strix';

        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
                <div style="background: linear-gradient(135deg, #FF8C00 0%, #FF6B00 100%); padding: 30px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px;">${storeName}</h1>
                    <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 14px;">AAPKI AASTHA KA SAARTHI</p>
                </div>
                
                <div style="padding: 30px;">
                    <h2 style="color: #FF8C00; margin-top: 0;">Password Reset Request</h2>
                    <p>We received a request to reset your password for your ${storeName} account.</p>
                    <p>Use the following OTP to reset your password:</p>
                    
                    <div style="background-color: #f3f4f6; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
                        <h1 style="color: #FF8C00; font-size: 36px; margin: 0; letter-spacing: 8px; font-weight: bold;">${code}</h1>
                    </div>
                    
                    <p style="color: #dc2626; font-weight: bold;">⚠️ This OTP will expire in 10 minutes.</p>
                    
                    <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
                        <p style="margin: 0; color: #92400e;"><strong>Security Tip:</strong> If you didn't request this password reset, please ignore this email. Your password will remain unchanged.</p>
                    </div>
                    
                    <p>For security reasons, do not share this OTP with anyone. ${storeName} staff will never ask for your OTP.</p>
                    
                    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
                    <p style="color: #6b7280; font-size: 12px; text-align: center;">
                        © ${new Date().getFullYear()} ${storeName} - Your Trusted Puja Store<br>
                        This is an automated email, please do not reply.
                    </p>
                </div>
        </div>
        `;

        await sendEmail({
            to: email,
            subject: `Password Reset OTP - ${storeName}`,
            html,
            provider: 'brevo'
        });

        console.log(`✅ Password reset OTP sent to ${email}`);
        return true;
    } catch (error) {
        console.error('❌ Failed to send password reset OTP:', error.message || error);
        return false;
    }
};

// Send password change OTP email using email service
const sendPasswordChangeOTP = async (email, code, userName) => {
    try {
        const Settings = require('../models/Settings');
        const storeSettings = await Settings.getSettings();
        const storeName = storeSettings.storeName || 'SIlver Strix';
        
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
                <div style="background: linear-gradient(135deg, #FF8C00 0%, #FF6B00 100%); padding: 30px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px;">${storeName}</h1>
                    <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 14px;">AAPKI AASTHA KA SAARTHI</p>
                </div>
                
                <div style="padding: 30px;">
                    <h2 style="color: #FF8C00; margin-top: 0;">Password Change Request</h2>
                    <p>Dear ${userName || 'Valued Customer'},</p>
                    <p>We received a request to change the password for your ${storeName} account.</p>
                    <p>Use the following OTP to change your password:</p>
                    
                    <div style="background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%); padding: 25px; text-align: center; margin: 20px 0; border-radius: 8px; border: 2px solid #FF8C00;">
                        <h1 style="color: #FF8C00; font-size: 42px; margin: 0; letter-spacing: 10px; font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.1);">${code}</h1>
                    </div>
                    
                    <p style="color: #dc2626; font-weight: bold; text-align: center;">⚠️ This OTP will expire in 10 minutes.</p>
                    
                    <div style="background-color: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px;">
                        <p style="margin: 0; color: #1e40af;"><strong>🔒 Security Information:</strong></p>
                        <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #1e40af;">
                            <li>This OTP is valid for 10 minutes only</li>
                            <li>Do not share this OTP with anyone</li>
                            <li>${storeName} staff will never ask for your OTP</li>
                            <li>If you didn't request this, please secure your account immediately</li>
                        </ul>
                    </div>
                    
                    <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
                        <p style="margin: 0; color: #92400e;"><strong>⚠️ Important:</strong> If you didn't request this password change, please ignore this email and consider changing your account password immediately for security.</p>
                    </div>
                    
                    <p style="text-align: center; margin-top: 30px;">
                        <a href="#" style="background-color: #FF8C00; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Change Password</a>
                    </p>
                    
                    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
                    <p style="color: #6b7280; font-size: 12px; text-align: center;">
                        © ${new Date().getFullYear()} ${storeName} - Your Trusted Puja Store<br>
                        This is an automated email, please do not reply.<br>
                        For support, contact: ${storeSettings.storeEmail || 'support@pujnamstore.com'}
                    </p>
                </div>
            </div>
        `;
        
        await sendEmail({
            to: email,
            subject: `Password Change OTP - ${storeName}`,
            html: html
        });
        
        return true;
    } catch (error) {
        console.error(`❌ Failed to send password change OTP to ${email}:`, error.message);
        return false;
    }
};

// Register - Store in pending registration, account will be created only after OTP verification
router.post('/register', async (req, res) => {
    let normalizedEmail;
    try {
        const { email, password, name, phone, acceptedPolicies } = req.body;
        normalizedEmail = (email || '').toLowerCase().trim();

        if (!acceptedPolicies) {
            return res.status(400).json({ error: 'Please accept Privacy Policy and T&Cs to continue.' });
        }

        // Check if user already exists (verified or unverified account)
        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) {
            if (existingUser.emailVerified) {
                return res.status(400).json({ error: 'Email already registered. Please login instead.' });
            } else {
                // Unverified account exists - delete it (user needs to register again and verify)
                await User.deleteOne({ email });
                console.log(`Deleted unverified account: ${email}`);
            }
        }

        // Check if there's already a pending registration for this email
        const existingPending = await PendingRegistration.findOne({ email: normalizedEmail });
        if (existingPending) {
            // Delete old pending registration
            await PendingRegistration.deleteOne({ email });
        }

        // Generate verification code
        const verificationCode = generateVerificationCode();
        const codeExpiry = new Date();
        codeExpiry.setMinutes(codeExpiry.getMinutes() + 10); // Code expires in 10 minutes

        // Store registration data in pending registration (NOT in User collection)
        const pendingRegistration = new PendingRegistration({ 
            email: normalizedEmail, 
            password, 
            rawPassword: password,
            name, 
            phone,
            acceptedPolicies: !!acceptedPolicies,
            emailVerificationCode: verificationCode,
            emailVerificationCodeExpiry: codeExpiry
        });
        await pendingRegistration.save();

        // Send verification email
        console.log(`📧 Attempting to send verification email to ${email}`);
        const emailSent = await sendVerificationEmail(normalizedEmail, verificationCode);
        
        if (!emailSent) {
            // If email fails, delete pending registration
            await PendingRegistration.deleteOne({ email });
            console.error(`❌ Registration failed for ${email} - email sending failed`);
            return res.status(500).json({ 
                error: 'Failed to send verification email. Please check your email service configuration and try again.',
                details: process.env.NODE_ENV === 'development' ? 'Check server logs for detailed error information' : undefined
            });
        }
        
        console.log(`✅ Verification email sent successfully to ${email}`);

        res.status(201).json({
            message: 'Verification code sent to your email. Please verify to complete registration.',
            requiresVerification: true,
            email: email,
            note: 'Your account will be created only after email verification. Please check your email for the OTP.'
        });
    } catch (error) {
        console.error('Registration error:', error);
        // Clean up on error
        const cleanupEmail = normalizedEmail || req.body.email;
        if (cleanupEmail) {
            await PendingRegistration.deleteOne({ email: cleanupEmail }).catch(() => {});
        }
        res.status(500).json({ error: error.message || 'Registration failed. Please try again.' });
    }
});

// Send verification code (for pending registrations only)
router.post('/send-verification-code', async (req, res) => {
    try {
        const { email, purpose, name, phone, shippingAddress } = req.body;
        const normalizedEmail = (email || '').toLowerCase().trim();

        if (!normalizedEmail) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // If verified user exists, treat this as login OTP request
        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) {
            const verificationCode = generateVerificationCode();
            const codeExpiry = new Date();
            codeExpiry.setMinutes(codeExpiry.getMinutes() + 10);

            existingUser.loginOTP = verificationCode;
            existingUser.loginOTPExpiry = codeExpiry;
            await existingUser.save();

            const emailSent = await sendVerificationEmail(existingUser.email, verificationCode, 'login');
            if (!emailSent) {
                return res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
            }

            return res.json({ message: 'Login OTP sent to your email' });
        }

        // Check for pending registration
        let pendingRegistration = await PendingRegistration.findOne({ email: normalizedEmail });
        if (!pendingRegistration && purpose === 'verifyCheckout') {
            // Auto-create pending registration from checkout details
            const tempPassword = Math.random().toString(36).slice(-10) + '@A1';
            pendingRegistration = new PendingRegistration({
                email: normalizedEmail,
                password: tempPassword,
                rawPassword: tempPassword,
                name: name || normalizedEmail.split('@')[0],
                phone: phone || '',
                shippingAddress: shippingAddress || {},
                acceptedPolicies: true,
                emailVerificationCode: generateVerificationCode(),
                emailVerificationCodeExpiry: new Date(Date.now() + 10 * 60 * 1000)
            });
            await pendingRegistration.save();
        } else if (!pendingRegistration) {
            return res.status(404).json({ 
                error: 'No pending registration found. Please register again.' 
            });
        }

        // Generate new verification code
        const verificationCode = generateVerificationCode();
        const codeExpiry = new Date();
        codeExpiry.setMinutes(codeExpiry.getMinutes() + 10);

        pendingRegistration.emailVerificationCode = verificationCode;
        pendingRegistration.emailVerificationCodeExpiry = codeExpiry;
        await pendingRegistration.save();

        // Send verification email
        const emailSent = await sendVerificationEmail(normalizedEmail, verificationCode, purpose === 'verifyCheckout' ? 'verify' : purpose);
        
        if (!emailSent) {
            return res.status(500).json({ 
                error: 'Failed to send verification email. Please try again.' 
            });
        }

        res.json({ 
            message: 'Verification code sent to your email',
            note: 'If you don\'t receive the email, please check your spam folder or try again.'
        });
    } catch (error) {
        console.error('Send verification code error:', error);
        res.status(500).json({ error: error.message || 'Failed to send verification code' });
    }
});

// Verify email and create account (only after OTP verification)
router.post('/verify-email', async (req, res) => {
    try {
        const { email, code } = req.body;
        const normalizedEmail = (email || '').toLowerCase().trim();

        if (!normalizedEmail || !code) {
            return res.status(400).json({ error: 'Email and OTP code are required' });
        }

        // Existing user OTP login flow
        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser && existingUser.loginOTP) {
            if (existingUser.loginOTP !== code) {
                return res.status(400).json({ error: 'Invalid OTP. Please request a new one.' });
            }
            if (new Date() > existingUser.loginOTPExpiry) {
                existingUser.loginOTP = null;
                existingUser.loginOTPExpiry = null;
                await existingUser.save();
                return res.status(400).json({ error: 'OTP expired. Please request again.' });
            }

            existingUser.loginOTP = null;
            existingUser.loginOTPExpiry = null;
            if (!existingUser.emailVerified) existingUser.emailVerified = true;
            // Send welcome email once if never sent (covers previously missing delivery)
            if (!existingUser.welcomeEmailSent) {
                try {
                    const sent = await sendWelcomeEmail(existingUser.email, existingUser.name);
                    if (sent) {
                        existingUser.welcomeEmailSent = true;
                    }
                } catch (err) {
                    console.error('Welcome email send failed during OTP login:', err.message);
                }
            }
            await existingUser.save();

            const token = jwt.sign(
                { userId: existingUser._id },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );
            return res.json({
                message: 'Login successful',
                user: {
                    id: existingUser._id,
                    email: existingUser.email,
                    name: existingUser.name,
                    role: existingUser.role,
                    emailVerified: true
                },
                token
            });
        }

        // Check if already verified user (but no OTP in place)
        if (existingUser && existingUser.emailVerified) {
            return res.status(400).json({ error: 'Please request a new OTP to login.' });
        }

        // Find pending registration
        const pendingRegistration = await PendingRegistration.findOne({ email: normalizedEmail });
        if (!pendingRegistration) {
            return res.status(404).json({ 
                error: 'No pending registration found. Please register again.' 
            });
        }

        // Check if code matches
        if (pendingRegistration.emailVerificationCode !== code) {
            return res.status(400).json({ error: 'Invalid verification code' });
        }

        // Check if code expired
        if (new Date() > pendingRegistration.emailVerificationCodeExpiry) {
            // Delete expired pending registration
            await PendingRegistration.deleteOne({ email });
            return res.status(400).json({ 
                error: 'Verification code expired. Please register again.' 
            });
        }

        // Create the actual user account (ONLY after OTP verification)
        const shouldSeedAddress = hasCompleteShippingAddress(pendingRegistration.shippingAddress);

        const user = new User({
            email: pendingRegistration.email,
            // Use raw password so User model hashes once (avoids double-hash)
            password: pendingRegistration.rawPassword,
            name: pendingRegistration.name,
            phone: pendingRegistration.phone,
            acceptedPolicies: pendingRegistration.acceptedPolicies,
            emailVerified: true, // Mark as verified since OTP is verified
            emailVerificationCode: null,
            emailVerificationCodeExpiry: null,
            address: shouldSeedAddress ? {
                street: pendingRegistration.shippingAddress.address,
                city: pendingRegistration.shippingAddress.city,
                state: pendingRegistration.shippingAddress.state,
                zipCode: pendingRegistration.shippingAddress.pincode,
                country: pendingRegistration.shippingAddress.country || 'India'
            } : undefined,
            addresses: shouldSeedAddress ? [{
                name: pendingRegistration.shippingAddress.name || pendingRegistration.name,
                phone: pendingRegistration.shippingAddress.phone || pendingRegistration.phone,
                email: pendingRegistration.shippingAddress.email || pendingRegistration.email,
                addressLine1: pendingRegistration.shippingAddress.address,
                addressLine2: pendingRegistration.shippingAddress.addressLine2,
                landmark: pendingRegistration.shippingAddress.landmark,
                city: pendingRegistration.shippingAddress.city,
                state: pendingRegistration.shippingAddress.state,
                pincode: pendingRegistration.shippingAddress.pincode,
                country: pendingRegistration.shippingAddress.country || 'India',
                addressType: 'home',
                isDefault: true
            }] : undefined
        });
        await user.save();

        // Store temp password hash for forced reset on first login
        const bcrypt = require('bcryptjs');
        const tempHash = await bcrypt.hash(pendingRegistration.rawPassword, 12);
        await TempPassword.findOneAndUpdate(
            { email: user.email },
            { email: user.email, passwordHash: tempHash },
            { upsert: true, new: true }
        );

        // Delete pending registration after successful account creation
        await PendingRegistration.deleteOne({ email: normalizedEmail });

        // Link past guest orders (if any) to this new user
        try {
            await Order.updateMany(
                { 'shippingAddress.email': user.email, user: null },
                { $set: { user: user._id } }
            );
        } catch (linkErr) {
            console.error('Failed to link guest orders to new user:', linkErr.message);
        }

        // Send welcome email to the newly created user
        try {
            const sent = await sendWelcomeEmail(user.email, user.name, pendingRegistration.rawPassword);
            if (sent) {
                user.welcomeEmailSent = true;
                await user.save();
            }
        } catch (emailError) {
            // Don't fail account creation if welcome email fails, just log it
            console.error('Failed to send welcome email:', emailError);
        }

        // Generate token
        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Email verified successfully. Your account has been created!',
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                role: user.role,
                emailVerified: true
            },
            token
        });
    } catch (error) {
        console.error('Verify email error:', error);
        
        // If user creation fails but pending registration exists, clean it up
        if (req.body.email) {
            await PendingRegistration.deleteOne({ email: req.body.email }).catch(() => {});
        }
        
        res.status(500).json({ 
            error: error.message || 'Failed to verify email. Please try again.' 
        });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password, adminLogin } = req.body;
        const normalizedEmail = (email || '').toLowerCase().trim();

        // Find user
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Block admin accounts from user login unless explicitly flagged as adminLogin
        if (user.role === 'admin' && !adminLogin) {
            return res.status(403).json({ error: 'Admin accounts must sign in via the admin portal.' });
        }

        // Check if email is verified (skip for admin users)
        if (!user.emailVerified && user.role !== 'admin') {
            return res.status(403).json({ 
                error: 'Email not verified. Please verify your email first.',
                requiresVerification: true,
                email: user.email
            });
        }

        // Check password
        const isMatch = await user.comparePassword(password);
        let requiresPasswordReset = false;

        if (!isMatch) {
            // Check temp password table for first-login password
            const bcrypt = require('bcryptjs');
            const temp = await TempPassword.findOne({ email: user.email });
            if (!temp || !(await bcrypt.compare(password, temp.passwordHash))) {
                return res.status(401).json({ error: 'Invalid email or password' });
            }
            requiresPasswordReset = true;
        }

        // If welcome email never sent (e.g., earlier failure), send it now
        if (!user.welcomeEmailSent) {
            try {
                const sent = await sendWelcomeEmail(user.email, user.name);
                if (sent) {
                    user.welcomeEmailSent = true;
                    await user.save();
                }
            } catch (err) {
                console.error('Welcome email send failed during password login:', err.message);
            }
        }

        // Generate token
        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Login successful',
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                role: user.role,
                emailVerified: user.emailVerified,
                requiresPasswordReset
            },
            token,
            requiresPasswordReset
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get current user
router.get('/me', auth, async (req, res) => {
    try {
        res.json({
            user: {
                id: req.user._id,
                email: req.user.email,
                name: req.user.name,
                phone: req.user.phone,
                address: req.user.address,
                role: req.user.role
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update profile
router.put('/profile', auth, async (req, res) => {
    try {
        const { name, phone, address } = req.body;

        const user = await User.findByIdAndUpdate(
            req.user._id,
            { name, phone, address },
            { new: true }
        ).select('-password');

        res.json({ message: 'Profile updated', user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Address Management Routes

// Helper function to ensure addresses field exists
const ensureAddressesField = async (userId) => {
    const user = await User.findById(userId);
    if (user && !user.addresses) {
        user.addresses = [];
        await user.save();
    }
    return user;
};

// Get all addresses
router.get('/addresses', auth, async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        // Ensure addresses field exists
        await ensureAddressesField(req.user._id);

        const user = await User.findById(req.user._id).select('addresses');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Ensure addresses is an array (handle case where field doesn't exist)
        const addresses = Array.isArray(user.addresses) ? user.addresses : [];
        res.json({ addresses });
    } catch (error) {
        console.error('Error fetching addresses:', error);
        res.status(500).json({ 
            error: error.message || 'Failed to fetch addresses',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Add new address
router.post('/addresses', auth, async (req, res) => {
    try {
        // Ensure addresses field exists
        await ensureAddressesField(req.user._id);

        const addressData = req.body;
        
        // If this is set as default, unset other defaults
        if (addressData.isDefault) {
            await User.updateOne(
                { _id: req.user._id, addresses: { $exists: true, $ne: [] } },
                { $set: { 'addresses.$[].isDefault': false } }
            );
        }

        // Prevent duplicate address entries (basic match on email + line1 + pincode)
        const existing = await User.findOne({
            _id: req.user._id,
            addresses: {
                $elemMatch: {
                    email: addressData.email || null,
                    addressLine1: addressData.addressLine1,
                    pincode: addressData.pincode
                }
            }
        }).select('addresses');

        let user;
        if (existing) {
            user = await User.findById(req.user._id).select('addresses');
        } else {
            user = await User.findByIdAndUpdate(
                req.user._id,
                { $push: { addresses: addressData } },
                { new: true, upsert: false }
            ).select('addresses');
        }

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.status(201).json({ 
            message: 'Address added successfully',
            address: user.addresses[user.addresses.length - 1]
        });
    } catch (error) {
        console.error('Error adding address:', error);
        res.status(500).json({ error: error.message || 'Failed to add address' });
    }
});

// Update address
router.put('/addresses/:addressId', auth, async (req, res) => {
    try {
        // Ensure addresses field exists
        await ensureAddressesField(req.user._id);

        const { addressId } = req.params;
        const addressData = req.body;

        // If this is set as default, unset other defaults
        if (addressData.isDefault) {
            await User.updateOne(
                { _id: req.user._id, addresses: { $exists: true, $ne: [] } },
                { $set: { 'addresses.$[].isDefault': false } }
            );
        }

        const user = await User.findOneAndUpdate(
            { _id: req.user._id, 'addresses._id': addressId },
            { $set: { 'addresses.$': { ...addressData, _id: addressId } } },
            { new: true }
        ).select('addresses');

        if (!user) {
            return res.status(404).json({ error: 'Address not found' });
        }

        res.json({ message: 'Address updated successfully', address: user.addresses.find(a => a._id.toString() === addressId) });
    } catch (error) {
        console.error('Error updating address:', error);
        res.status(500).json({ error: error.message || 'Failed to update address' });
    }
});

// Delete address
router.delete('/addresses/:addressId', auth, async (req, res) => {
    try {
        // Ensure addresses field exists
        await ensureAddressesField(req.user._id);

        const { addressId } = req.params;

        const user = await User.findByIdAndUpdate(
            req.user._id,
            { $pull: { addresses: { _id: addressId } } },
            { new: true }
        ).select('addresses');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ message: 'Address deleted successfully', addresses: user.addresses || [] });
    } catch (error) {
        console.error('Error deleting address:', error);
        res.status(500).json({ error: error.message || 'Failed to delete address' });
    }
});

// Set default address
router.put('/addresses/:addressId/default', auth, async (req, res) => {
    try {
        // Ensure addresses field exists
        await ensureAddressesField(req.user._id);

        const { addressId } = req.params;

        // Unset all defaults (only if addresses array exists and is not empty)
        await User.updateOne(
            { _id: req.user._id, addresses: { $exists: true, $ne: [] } },
            { $set: { 'addresses.$[].isDefault': false } }
        );

        // Set this address as default
        const user = await User.findOneAndUpdate(
            { _id: req.user._id, 'addresses._id': addressId },
            { $set: { 'addresses.$.isDefault': true } },
            { new: true }
        ).select('addresses');

        if (!user) {
            return res.status(404).json({ error: 'Address not found' });
        }

        res.json({ message: 'Default address updated', addresses: user.addresses || [] });
    } catch (error) {
        console.error('Error setting default address:', error);
        res.status(500).json({ error: error.message || 'Failed to set default address' });
    }
});

// Forgot Password - Request OTP
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Find user by email (only verified users can reset password)
        const user = await User.findOne({ 
            email: email.toLowerCase().trim(),
            emailVerified: true // Only allow password reset for verified accounts
        });
        
        // Check if account exists - show error if not found
        if (!user) {
            // Also check if there's a pending registration
            const pendingRegistration = await PendingRegistration.findOne({ email: email.toLowerCase().trim() });
            
            if (pendingRegistration) {
                return res.status(400).json({ 
                    error: 'Account not verified yet. Please verify your email first to complete registration.' 
                });
            }
            
            // No account found
            return res.status(404).json({ 
                error: 'No account found with this email address. Please check your email or register a new account.' 
            });
        }

        // Generate 6-digit OTP
        const resetOTP = generateVerificationCode();
        const otpExpiry = new Date();
        otpExpiry.setMinutes(otpExpiry.getMinutes() + 10); // OTP expires in 10 minutes

        // Save OTP and expiry to user
        user.passwordResetOTP = resetOTP;
        user.passwordResetOTPExpiry = otpExpiry;
        await user.save();

        // Send password reset OTP email
        const emailSent = await sendPasswordResetOTP(user.email, resetOTP);
        
        if (!emailSent) {
            // Clear OTP if email failed
            user.passwordResetOTP = null;
            user.passwordResetOTPExpiry = null;
            await user.save();
            return res.status(500).json({ error: 'Failed to send password reset email. Please try again later.' });
        }

        res.json({ 
            message: 'Password reset OTP has been sent to your email address.',
            email: user.email
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: error.message || 'Failed to process password reset request' });
    }
});

// Reset Password - Verify OTP and Reset Password
router.post('/reset-password', async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        // Validate input
        if (!email || !otp || !newPassword) {
            return res.status(400).json({ error: 'Email, OTP, and new password are required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }

        // Find user
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if OTP exists
        if (!user.passwordResetOTP) {
            return res.status(400).json({ error: 'No password reset request found. Please request a new OTP.' });
        }

        // Verify OTP
        if (user.passwordResetOTP !== otp) {
            return res.status(400).json({ error: 'Invalid OTP. Please check and try again.' });
        }

        // Check if OTP expired
        if (new Date() > user.passwordResetOTPExpiry) {
            // Clear expired OTP
            user.passwordResetOTP = null;
            user.passwordResetOTPExpiry = null;
            await user.save();
            return res.status(400).json({ error: 'OTP has expired. Please request a new password reset.' });
        }

        // Reset password
        user.password = newPassword; // Will be hashed by pre-save hook
        user.passwordResetOTP = null;
        user.passwordResetOTPExpiry = null;
        await user.save();

        res.json({ 
            message: 'Password reset successfully. You can now login with your new password.' 
        });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: error.message || 'Failed to reset password' });
    }
});

// Resend Password Reset OTP
router.post('/resend-password-reset-otp', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        
        // For security, don't reveal if email exists
        if (!user) {
            return res.json({ 
                message: 'If an account exists with this email, a password reset OTP has been sent.' 
            });
        }

        // Generate new OTP
        const resetOTP = generateVerificationCode();
        const otpExpiry = new Date();
        otpExpiry.setMinutes(otpExpiry.getMinutes() + 10);

        // Save new OTP
        user.passwordResetOTP = resetOTP;
        user.passwordResetOTPExpiry = otpExpiry;
        await user.save();

        // Send email
        const emailSent = await sendPasswordResetOTP(user.email, resetOTP);
        
        if (!emailSent) {
            user.passwordResetOTP = null;
            user.passwordResetOTPExpiry = null;
            await user.save();
            return res.status(500).json({ error: 'Failed to send password reset email. Please try again later.' });
        }

        res.json({ 
            message: 'If an account exists with this email, a password reset OTP has been sent.' 
        });
    } catch (error) {
        console.error('Resend password reset OTP error:', error);
        res.status(500).json({ error: error.message || 'Failed to resend password reset OTP' });
    }
});

// Change Password - Request OTP (Authenticated Users)
router.post('/change-password/request-otp', auth, async (req, res) => {
    try {
        // User is already authenticated via auth middleware
        const user = await User.findById(req.user._id);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Generate 6-digit OTP for password change
        const changeOTP = generateVerificationCode();
        const otpExpiry = new Date();
        otpExpiry.setMinutes(otpExpiry.getMinutes() + 10); // OTP expires in 10 minutes

        // Save OTP and expiry to user
        user.passwordChangeOTP = changeOTP;
        user.passwordChangeOTPExpiry = otpExpiry;
        await user.save();

        // Send password change OTP email
        const emailSent = await sendPasswordChangeOTP(user.email, changeOTP, user.name);
        
        if (!emailSent) {
            // Clear OTP if email failed
            user.passwordChangeOTP = null;
            user.passwordChangeOTPExpiry = null;
            await user.save();
            return res.status(500).json({ error: 'Failed to send password change OTP email. Please try again later.' });
        }

        res.json({ 
            message: 'Password change OTP has been sent to your email address.',
            email: user.email
        });
    } catch (error) {
        console.error('Change password request OTP error:', error);
        res.status(500).json({ error: error.message || 'Failed to process password change request' });
    }
});

// Change Password - Verify OTP and Change Password (Authenticated Users)
router.post('/change-password', auth, async (req, res) => {
    try {
        const { otp, newPassword } = req.body;

        // Validate input
        if (!otp || !newPassword) {
            return res.status(400).json({ error: 'OTP and new password are required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }

        // Get authenticated user
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if OTP exists
        if (!user.passwordChangeOTP) {
            return res.status(400).json({ error: 'No password change request found. Please request a new OTP.' });
        }

        // Verify OTP
        if (user.passwordChangeOTP !== otp) {
            return res.status(400).json({ error: 'Invalid OTP. Please check and try again.' });
        }

        // Check if OTP expired
        if (new Date() > user.passwordChangeOTPExpiry) {
            // Clear expired OTP
            user.passwordChangeOTP = null;
            user.passwordChangeOTPExpiry = null;
            await user.save();
            return res.status(400).json({ error: 'OTP has expired. Please request a new password change OTP.' });
        }

        // Change password
        user.password = newPassword; // Will be hashed by pre-save hook
        user.passwordChangeOTP = null;
        user.passwordChangeOTPExpiry = null;
        await user.save();

        res.json({ 
            message: 'Password changed successfully. Please login with your new password.' 
        });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: error.message || 'Failed to change password' });
    }
});

// Resend Password Change OTP (Authenticated Users)
router.post('/change-password/resend-otp', auth, async (req, res) => {
    try {
        // User is already authenticated via auth middleware
        const user = await User.findById(req.user._id);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Generate new OTP
        const changeOTP = generateVerificationCode();
        const otpExpiry = new Date();
        otpExpiry.setMinutes(otpExpiry.getMinutes() + 10);

        // Save new OTP
        user.passwordChangeOTP = changeOTP;
        user.passwordChangeOTPExpiry = otpExpiry;
        await user.save();

        // Send email
        const emailSent = await sendPasswordChangeOTP(user.email, changeOTP, user.name);
        
        if (!emailSent) {
            user.passwordChangeOTP = null;
            user.passwordChangeOTPExpiry = null;
            await user.save();
            return res.status(500).json({ error: 'Failed to send password change OTP email. Please try again later.' });
        }

        res.json({ 
            message: 'Password change OTP has been resent to your email address.',
            email: user.email
        });
    } catch (error) {
        console.error('Resend password change OTP error:', error);
        res.status(500).json({ error: error.message || 'Failed to resend password change OTP' });
    }
});

module.exports = router;
