require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const app = express();
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const router = express.Router();
const validator = require('validator');
const QRCode = require('qrcode');
const moment = require('moment-timezone'); 

const { v4: uuidv4 } = require('uuid');

const users = new Map(); 
const generatedPasses = new Map();

fs.mkdirSync(path.join(__dirname, 'passes'), { recursive: true });
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
// Email configuration
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST, // e.g., 'smtp.gmail.com'
    port: process.env.EMAIL_PORT, // e.g., 587 for TLS, 465 for SSL
    secure: false, // true for 465, false for 587 with STARTTLS
    auth: {
        user: process.env.EMAIL_USER, // e.g., 'your.email@gmail.com'
        pass: process.env.EMAIL_PASS  // e.g., app-specific password
    },
    maxConnections: 7, // Maximum simultaneous connections
    maxMessages: 100 // Maximum messages per connection
});
// Send email function
const sendEmail = async (to, subject, text) => {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to,
        subject,
        text
    };
    try {
        await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${to}`);
    } catch (error) {
        console.error('Error sending email:', error);
        throw new Error('Failed to send email');
    }
};
// OTP storage
const otpStore = new Map();

// Generate OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate Pass Number
function generatePassNumber() {
    return 'PASS' + Math.floor(100000 + Math.random() * 900000);
}

// Calculate Expiry Date
function calculateExpiryDate(passType) {
    const today = new Date();
    if (passType === 'monthly') {
        today.setMonth(today.getMonth() + 1);
    } else if (passType === 'quarterly') {
        today.setMonth(today.getMonth() + 3);
    } else if (passType === 'yearly') {
        today.setFullYear(today.getFullYear() + 1);
    }
    return today.toISOString().split('T')[0];
}

// Database connection
const con = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

con.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL database');
});

// Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'home.html')));
app.get('/homee', (req, res) => res.sendFile(path.join(__dirname, 'home2.html')));
app.get('/regi', (req, res) => res.sendFile(path.join(__dirname, 'registration.html')));
app.get('/one', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/two', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/ad', (req, res) => res.sendFile(path.join(__dirname, 'adminregistration.html')));
app.get('/adm', (req, res) => res.sendFile(path.join(__dirname, 'adminlogin.html')));
app.get('/three', (req, res) => res.sendFile(path.join(__dirname, 'profile.html')));
app.get('/hist', (req, res) => res.sendFile(path.join(__dirname, 'history.html')));
app.get('/four', (req, res) => res.sendFile(path.join(__dirname, 'apply.html')));
app.get('/five', (req, res) => res.sendFile(path.join(__dirname, 'apply2.html')));
app.get('/11', (req, res) => res.sendFile(path.join(__dirname, 'enquiry.html')));
app.get('/six', (req, res) => res.sendFile(path.join(__dirname, 'renewal.html')));
app.get('/ten', (req, res) => res.sendFile(path.join(__dirname, 'search.html')));
app.get('/6', (req, res) => res.sendFile(path.join(__dirname, 'logout.html')));
app.get('/seven', (req, res) => res.sendFile(path.join(__dirname, 'contactus.html')));
app.get('/14', (req, res) => res.sendFile(path.join(__dirname, 'contactus1.html')));
app.get('/12', (req, res) => res.sendFile(path.join(__dirname, 'aboutus.html')));
app.get('/13', (req, res) => res.sendFile(path.join(__dirname, 'aboutus2.html')));
app.get('/apply3', (req, res) => res.sendFile(path.join(__dirname, 'apply2.html')));
app.get('/adminlog', (req, res) => res.sendFile(path.join(__dirname, 'adminlogout.html')));
app.get('/otp-verification', (req, res) => {
    const { email, otp } = req.query;
    if (!email || !otp) {
        return res.sendFile(path.join(__dirname, 'otp-verification.html')); // Serve form if no query params
    }
    const storedOtp = otpStore.get(email);
    if (!storedOtp) {
        return res.status(400).send('No OTP found for this email or OTP expired');
    }
    if (storedOtp === otp) {
        otpStore.delete(email);
        res.redirect(`/reset-password?email=${encodeURIComponent(email)}`);
    } else {
        res.status(400).send('Invalid OTP');
    }
});
app.get('/forgot-password', (req, res) => res.sendFile(path.join(__dirname, 'forgot-password.html')));
app.get('/reset-password', (req, res) => res.sendFile(path.join(__dirname, 'reset-password.html')));
app.get('/manage-pass', (req, res) => res.sendFile(path.join(__dirname, 'manage-pass.html')));
app.get('/view-pass', (req, res) => res.sendFile(path.join(__dirname, 'view-pass.html')));
app.get('/generator', (req, res) => res.sendFile(path.join(__dirname, 'generator.html')));
app.get('/pass-generator', (req, res) => res.sendFile(path.join(__dirname, 'pass-generator.html')));

// OTP Routes
app.post('/send-otp', (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    const normalizedEmail = email.toLowerCase().trim();
    con.query('SELECT * FROM users WHERE Email = ?', [normalizedEmail], (err, result) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      if (result.length === 0) {
        return res.status(404).json({ error: 'Email not found' });
      }
  
      const otp = generateOTP();
      otpStore.set(normalizedEmail, otp);
      setTimeout(() => otpStore.delete(normalizedEmail), 10 * 60 * 1000);
  
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: normalizedEmail,
        subject: 'Your OTP for Password Reset',
        text: `Your OTP is ${otp}. It is valid for 10 minutes.`,
      };
  
      transporter.sendMail(mailOptions, (error) => {
        if (error) {
          console.error('Error sending email:', err);
          return res.status(500).json({ error: 'Failed to send OTP' });
        }
        res.json({ success: 'OTP sent to email' });
      });
    });
  });
app.post('/verify-otp', (req, res) => {
    const { email, otp } = req.body;
    const normalizedEmail = email.toLowerCase().trim();
    console.log('Received /verify-otp:', { normalizedEmail, otp });
    if (!normalizedEmail || !otp) {
        return res.status(400).json({ error: 'Email and OTP are required' });
    }
    const storedOtp = otpStore.get(normalizedEmail);
    console.log('Stored OTP:', storedOtp);
    if (!storedOtp) {
        return res.status(400).json({ error: 'No OTP found for this email or OTP expired' });
    }
    if (storedOtp === otp) {
        otpStore.delete(normalizedEmail);
        return res.status(200).json({ message: 'OTP verified successfully', email: normalizedEmail });
    }
    return res.status(400).json({ error: 'Invalid OTP' });
});

app.post('/reset-password', (req, res) => {
    const { Email, newPassword, confirmPassword } = req.body;
    const normalizedEmail = Email.toLowerCase().trim();
    console.log('Received /reset-password:', { Email: normalizedEmail, newPassword, confirmPassword });
    
    // Validate required fields
    if (!normalizedEmail || !newPassword || !confirmPassword) {
        return res.status(400).json({ error: 'Email, new password, and confirm password are required' });
    }
    
    // Check if passwords match
    if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: 'Passwords do not match' });
    }
    
    // Update password in database
    con.query('UPDATE users SET Password = ? WHERE Email = ?', [newPassword, normalizedEmail], (err, result) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Email not found' });
        }
        res.json({ success: 'Password reset successful' });
    });
});


// User Registration
app.post('/reg', (req, res) => {
    console.log('Raw request body:', req.body);
    const { fname, email, phone, password } = req.body;
    console.log('Registration attempt:', { fname, email, phone, password });

    if (!fname || !email || !phone || !password) {
        console.log('Missing fields:', { fname, email, phone, password });
        return res.status(400).json({ error: 'All fields (fname, email, phone, password) are required' });
    }

    const checkQuery = 'SELECT * FROM users WHERE Email = ?';
    con.query(checkQuery, [email], (err, result) => {
        if (err) {
            console.error('Email check error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (result.length > 0) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const insertQuery = 'INSERT INTO users (fname, Email, Phone, Password) VALUES (?, ?, ?, ?)';
        con.query(insertQuery, [fname, email, phone, password], (err2) => {
            if (err2) {
                console.error('Insert error:', err2);
                if (err2.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ error: 'Email already exists' });
                }
                return res.status(500).json({ error: 'Failed to register user' });
            }

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'Registered Successful',
                text: `Thank you for registering with the Bus Pass System! .`
            };

            transporter.sendMail(mailOptions, (error) => {
                if (error) {
                    console.error('Failed to send unique ID email:', error);
                    res.status(200).json({ 
                        success: 'Registration successful', 
                        warning: 'Failed to send email, please check your email settings' 
                    });
                } else {
                    res.status(200).json({ success: 'Registration successful' });
                }
            });
        });
    });
});

// User Login
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    console.log('Login attempt:', { email, password });

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    con.query('SELECT * FROM users WHERE Email = ? AND Password = ?', [email, password], (err, result) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (result.length > 0) {
            return res.status(200).json({ success: 'Login successful' });
        }
        return res.status(401).json({ error: 'Invalid login credentials' });
    });
});

// File upload setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });
app.use('/uploads', express.static('uploads'));

// Pass prices
const passPrices = {
    "BITS": {
                "Warangal": { monthly: 300, quarterly: 550, yearly: 900 },
                "Laknepally": { monthly: 100, quarterly: 350, yearly: 600 },
                "Kommala": { monthly: 150, quarterly: 450, yearly: 700 },
                "Girnibavi": { monthly: 100, quarterly: 250, yearly: 800 },
                "Dharmaram": { monthly: 180, quarterly: 490, yearly: 850 },
                "Hanmakonda": { monthly: 350, quarterly: 600, yearly: 1000 },
                "Narsampet": { monthly: 100, quarterly: 300, yearly: 700 }
            },
            "JITS": {
                "Warangal": { monthly: 350, quarterly: 600, yearly: 950 },
                "Laknepally": { monthly: 150, quarterly: 400, yearly: 650 },
                "Kommala": { monthly: 200, quarterly: 500, yearly: 800 },
                "Girnibavi": { monthly: 200, quarterly: 450, yearly: 800 },
                "Dharmaram": { monthly: 250, quarterly: 580, yearly: 920 },
                "Hanmakonda": { monthly: 400, quarterly: 850, yearly: 1100 },
                "Narsampet": { monthly: 120, quarterly: 350, yearly: 800 }
            } ,

           
            "Vaagdevi" : {
                "Warangal": { monthly: 100, quarterly: 450, yearly: 700 },
                "Laknepally": { monthly: 200, quarterly: 650, yearly: 850 },
                "Kommala": { monthly: 300, quarterly: 550, yearly: 800 },
                "Girnibavi": { monthly: 350, quarterly: 750, yearly: 800 },
                "Dharmaram": { monthly: 280, quarterly: 490, yearly: 750 },
                "Hanmakonda": { monthly: 120, quarterly: 400, yearly: 600 },
                "Narsampet": { monthly: 400, quarterly: 600, yearly: 1000 }
            },
            "kakatiya": {
                "Warangal": { monthly: 100, quarterly: 450, yearly: 700 },
                "Laknepally": { monthly: 200, quarterly: 650, yearly: 850 },
                "Kommala": { monthly: 300, quarterly: 550, yearly: 800 },
                "Girnibavi": { monthly: 350, quarterly: 750, yearly: 800 },
                "Dharmaram": { monthly: 350, quarterly: 490, yearly: 750 },
                "Hanmakonda": { monthly: 120, quarterly: 400, yearly: 600 },
                "Narsampet": { monthly: 400, quarterly: 600, yearly: 1000 }
            },
            "vivekananda": {
                "Warangal": { monthly: 100, quarterly: 450, yearly: 700 },
                "Laknepally": { monthly: 550, quarterly: 750, yearly: 950 },
                "Kommala": { monthly: 400, quarterly: 650, yearly: 800 },
                "Girnibavi": { monthly: 350, quarterly: 750, yearly: 800 },
                "Dharmaram": { monthly: 280, quarterly: 490, yearly: 750 },
                "Hanmakonda": { monthly: 120, quarterly: 400, yearly: 600 },
                "Narsampet": { monthly: 600, quarterly: 800, yearly: 1200 }
            },
};
// Generate OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Calculate Expiry Date
function calculateExpiryDate(renewalPeriod) {
    const today = new Date();
    if (renewalPeriod === 'monthly') {
        today.setMonth(today.getMonth() + 1);
    } else if (renewalPeriod === 'quarterly') {
        today.setMonth(today.getMonth() + 6);
    } else if (renewalPeriod === 'yearly') {
        today.setFullYear(today.getFullYear() + 1);
    }
    return today.toISOString().split('T')[0];
}


// POST /applyPass endpoint
app.post('/applyPass', upload.fields([
    { name: 'payment', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
    { name: 'aadhar', maxCount: 1 },
    { name: 'id-proof', maxCount: 1 },
    { name: 'bonafide', maxCount: 1 }
]), (req, res) => {
    console.log('Received POST /applyPass:', req.body, req.files);

    const { fname, email, phone, dob, gender, address, source, destination, course, year, renewalPeriod, amount} = req.body;

    // Parse amount
    const cleanAmount = parseInt(amount.replace(/[^0-9]/g, '')) || 0;

    // Validate inputs
    if (!fname || !email || !phone || !dob || !gender || !address || !source || !destination || !course || !year || !renewalPeriod ) {
        console.log('Validation failed: Missing required fields');
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    if (!['male', 'female', 'other'].includes(gender)) {
        console.log('Validation failed: Invalid gender:', gender);
        return res.status(400).json({ success: false, message: 'Invalid gender' });
    }
    if (!['Narsampet', 'Warangal', 'Laknepally','Kommala', 'Girnibavi', 'Dharmaram', 'Hanmakonda'].includes(source)) {
        console.log('Validation failed: Invalid source:', source);
        return res.status(400).json({ success: false, message: 'Invalid source' });
    }
    if (!['BITS', 'JITS', 'Vaagdevi', 'vivekananda','kakatiya'].includes(destination)) {
        console.log('Validation failed: Invalid destination:', destination);
        return res.status(400).json({ success: false, message: 'Invalid destination' });
    }
    if (!['monthly', 'quarterly', 'yearly'].includes(renewalPeriod)) {
        console.log('Validation failed: Invalid renewalPeriod:', renewalPeriod);
        return res.status(400).json({ success: false, message: 'Invalid pass_type' });
    }

    // Validate amount
    const expectedAmount = passPrices[destination]?.[source]?.[renewalPeriod];
    if (!expectedAmount || expectedAmount !== cleanAmount) {
        console.log('Validation failed: Invalid amount:', { source, destination, renewalPeriod, cleanAmount });
        return res.status(400).json({ success: false, message: 'Invalid amount or selection' });
    }

    // File paths
    const paymentPath = req.files['payment'] ? req.files['payment'][0].filename : null;
    const photoPath = req.files['photo'] ? req.files['photo'][0].filename : null;
    const aadharPath = req.files['aadhar'] ? req.files['aadhar'][0].filename : null;
    const idProofPath = req.files['id-proof'] ? req.files['id-proof'][0].filename : null;
    const bonafidePath = req.files['bonafide'] ? req.files['bonafide'][0].filename : null;

    // Validate required files
    if (!photoPath || !idProofPath || !bonafidePath) {
        console.log('Validation failed: Missing required files');
        return res.status(400).json({ success: false, message: 'Missing required files: photo, id-proof, or bonafide' });
    }

    const query = `
        INSERT INTO application (
            fname, email, phone, dob, gender, address, source, destination, course, year,
            renewalPeriod, amount, paymentPath, photoPath, aadharPath, idProofPath, bonafidePath
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [
        fname, email, phone, dob, gender, address, source, destination, course, year,
        renewalPeriod, cleanAmount, paymentPath, photoPath, aadharPath, idProofPath, bonafidePath
    ];

    console.log('Inserting data:', values);
    con.query(query, values, (err, result) => {
        if (err) {
            console.error('Error inserting data:', err);
            return res.status(500).json({ success: false, message: 'Database error: ' + err.message });
        }
        console.log('Data inserted successfully:', result);
        res.json({ success: true, message: 'Application submitted successfully', redirect: '/homee' });
    });
});

app.post('/apply1', upload.fields([
    { name: 'payment', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
    { name: 'aadhar', maxCount: 1 },
    { name: 'id-proof', maxCount: 1 },
    { name: 'bonafide', maxCount: 1 }
]), (req, res) => {
    const { fname, email, phone, dob, gender, address, source, destination, course, year, renewalPeriod } = req.body;
    const amount = passPrices[destination]?.[source]?.[renewalPeriod];
    if (!amount) {
        return res.status(400).send('Invalid selection, please try again.');
    }
    const paymentPath = req.files['payment'] ? req.files['payment'][0].filename : null;
    const photoPath = req.files['photo'] ? req.files['photo'][0].filename : null;
    const aadharPath = req.files['aadhar'] ? req.files['aadhar'][0].filename : null;
    const idProofPath = req.files['id-proof'] ? req.files['id-proof'][0].filename : null;
    const bonafidePath = req.files['bonafide'] ? req.files['bonafide'][0].filename : null;
    const query = `
        INSERT INTO application (fname, email, phone, dob, gender, address, source, destination, course, year, renewalPeriod, amount, paymentPath, photoPath, aadharPath, idProofPath, bonafidePath)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const values = [fname, email, phone, dob, gender, address, source, destination, course, year, renewalPeriod, amount, paymentPath, photoPath, aadharPath, idProofPath, bonafidePath];
    con.query(query, values, (err) => {
        if (err) {
            console.error('Error inserting data:', err);
            return res.status(500).send('Database error');
        }
        res.redirect('/two');
    });
});

// Total Pass Count
app.get('/admin-total-pass', (req, res) => {
    const query = 'SELECT COUNT(*) AS total FROM application';
    con.query(query, (err, result) => {
        if (err) {
            console.error('Error fetching total applications:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        const total = result[0].total || 0;
        res.json({ success: true, total });
    });
});


// Admin Enquiries
app.get('/admin-enquiries', (req, res) => {
    const query = 'SELECT * FROM application';
    con.query(query, (err, result) => {
        if (err) {
            console.error('Error fetching applications:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        res.json({ success: true, applications: result });
    });
});


// API endpoint to fetch manage_pass data
app.get('/api/manage-pass', (req, res) => {
    const status = req.query.status;
    let query = 'SELECT * FROM manage_pass';
    const params = [];
    
    if (status) {
        query += ' WHERE status = ?';
        params.push(status);
    }
    
    con.query(query, params, (err, result) => {
        if (err) {
            console.error('Error fetching manage_pass data:', err.message, err.stack);
            return res.status(500).json({ success: false, message: `Database error: ${err.message}` });
        }
        
        console.log('Query executed. Records found:', result.length);
        res.json({ success: true, passes: result });
    });
});

// Function to generate a unique 10-digit pass number starting with "PASS"
function generatePassNumber() {
    const randomNum = Math.floor(100000 + Math.random() * 900000); // Generates a 6-digit number (100000-999999)
    return `PASS${randomNum}`;
  }
  
  // Route for admin to approve or reject
  app.post('/admin/approve', async (req, res) => {
    const { userEmail, isApproved } = req.body;
  
    if (!userEmail || typeof isApproved !== 'boolean') {
      return res.status(400).json({ error: 'user Email and is Approved are required' });
    }
  
    try {
      // Email options
      let mailOptions;
  
      if (isApproved) {
        // Generate pass number
        const passNumber = generatePassNumber();
  
        // Approval email
        mailOptions = {
          from: 'your-email@gmail.com', // Sender email
          to: userEmail, // Recipient email
          subject: 'Pass Approval Notification',
          text: `Congratulations! Your pass has been approved. Your pass number is: ${passNumber}`,
        };
      } else {
        // Rejection email
        mailOptions = {
          from: 'your-email@gmail.com',
          to: userEmail,
          subject: 'Pass Rejection Notification',
          text: 'We regret to inform you that your pass request has been rejected.',
        };
      }
  
      // Send email
      await transporter.sendMail(mailOptions);
      res.status(200).json({ message: isApproved ? 'Pass approved and email sent' : 'Pass rejected and email sent' });
    } catch (error) {
      console.error('Error sending email:', error);
      res.status(500).json({ error: 'Failed to send email' });
    }
  }); 
// Accept Application (For Enquiry Page)
app.post('/accept-application', (req, res) => {
    const { id } = req.body;
    const fetchQuery = 'SELECT * FROM application WHERE id = ?';
    con.query(fetchQuery, [id], (err, rows) => {
        if (err || rows.length === 0) {
            console.error('Fetch error:', err || 'No application found');
            return res.status(500).json({ success: false, message: 'Error fetching application' });
        }
        const data = rows[0];
        const insertQuery = `
            INSERT INTO manage_pass (fname, email, phone, dob, gender, address, source, destination, course, year, renewalPeriod, passNumber, expiryDate, amount, photoPath)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
    data.fname, data.email, data.phone, data.dob, data.gender, data.address,
    data.source, data.destination, data.course, data.year, data.renewalPeriod,
    generatePassNumber(), calculateExpiryDate(data.renewalPeriod), data.amount,
    data.photoPath
];
        con.query(insertQuery, values, (err2) => {
            if (err2) {
                console.error('Insert error into manage_pass:', err2);
                return res.status(500).json({ success: false, message: 'Failed to insert into manage_pass' });
            }
            con.query('DELETE FROM application WHERE id = ?', [id], (err3) => {
                if (err3) {
                    console.error('Delete from application failed:', err3);
                    return res.status(500).json({ success: false, message: 'Failed to delete application' });
                }
                res.json({ success: true, message: 'Application accepted and moved to manage_pass' });
            });
        });
    });
});

// Reject Application (For Enquiry Page)
app.post('/reject-application', (req, res) => {
    const { id } = req.body;
    con.query('DELETE FROM application WHERE id = ?', [id], (err) => {
        if (err) {
            console.error('Reject deletion failed:', err);
            return res.status(500).json({ success: false, message: 'Failed to delete rejected application' });
        }
        res.json({ success: true, message: 'Application rejected and removed' });
    });
    
});

// Approve Application Route
app.post('/admin/manage-pass/:id', (req, res) => {
    const id = req.params.id;
    const getQuery = 'SELECT * FROM application WHERE id = ?';
    con.query(getQuery, [id], (err, results) => {
        if (err || results.length === 0) {
            console.error('Fetch error:', err || 'No application found');
            return res.status(500).json({ success: false, message: 'Error fetching application' });
        }
        const application = results[0];
        const insertQuery = `
            INSERT INTO manage_pass 
            (fname, email, phone, dob, gender, address, source, destination, course, year, renewalPeriod, amount, photoPath)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
    application.fname, application.email, application.phone, application.dob, application.gender,
    application.address, application.source, application.destination, application.course, application.year,
    application.renewalPeriod, generatePassNumber(), calculateExpiryDate(application.renewalPeriod), application.amount,
    application.photoPath
];
        con.query(insertQuery, values, (insertErr) => {
            if (insertErr) {
                console.error('Error inserting into manage_pass:', insertErr);
                return res.status(500).json({ success: false, message: 'Error inserting into manage_pass' });
            }
            con.query('DELETE FROM application WHERE id = ?', [id], (deleteErr) => {
                if (deleteErr) {
                    console.error('Error deleting application:', deleteErr);
                    return res.status(500).json({ success: false, message: 'Error deleting application' });
                }
                res.json({ success: true, message: 'Application approved and moved to manage_pass' });
            });
        });
    });
});

app.post('/admin/approve/:id', async (req, res) => {
    const { id } = req.params;

    // Fetch application data
    const getQuery = 'SELECT * FROM application WHERE id = ?';
    con.query(getQuery, [id], async (err, results) => {
        if (err || results.length === 0) {
            console.error('Fetch error:', err || 'No application found');
            return res.status(500).json({ error: 'Error fetching application' });
        }

        const application = results[0];
        const passNumber = generatePassNumber(); // Generate pass number
        const expiryDate = calculateExpiryDate(application.renewalPeriod); // Assuming this function exists

        // Validate amount
        const amount = parseInt(application.amount, 10);
        if (isNaN(amount)) {
            console.error('Invalid amount value:', application.amount);
            return res.status(400).json({ error: 'Invalid amount value' });
        }

        // Insert into manage_pass
        const insertQuery = `
            INSERT INTO manage_pass 
            (fname, email, phone, dob, gender, address, source, destination, course, year, passNumber, expiryDate, renewalPeriod, amount, photoPath)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            application.fname, application.email, application.phone, application.dob, application.gender,
            application.address, application.source, application.destination, application.course, application.year,
            passNumber, expiryDate, application.renewalPeriod, amount, application.photoPath
        ];

        con.query(insertQuery, values, async (insertErr) => {
            if (insertErr) {
                console.error('Error inserting into manage_pass:', insertErr);
                return res.status(500).json({ error: 'Error inserting into manage_pass' });
            }

            // Delete from application
            con.query('DELETE FROM application WHERE id = ?', [id], async (deleteErr) => {
                if (deleteErr) {
                    console.error('Error deleting application:', deleteErr);
                    return res.status(500).json({ error: 'Error deleting application' });
                }

                // Send email notification
                try {
            await sendEmail(
              application.email,
              'Bus Pass Approved',
              `Dear ${application.fname},\n\nYour bus pass has been approved! Your pass number is: ${passNumber}\n\nThank you,\nBus Pass System`
            );
            res.json({ message: 'Pass approved and notification sent' });
          } catch (emailError) {
            console.error('Email error:', emailError);
            res.status(200).json({ message: 'Pass approved but failed to send notification', emailError: emailError.message });
          }
            });
        });
    });
});
app.post('/admin/reject/:id', async (req, res) => {
    const { id } = req.params;
    console.log('Rejecting application with ID:', id);

    // Validate ID
    if (!id || isNaN(id)) {
        console.error('Invalid ID:', id);
        return res.status(400).json({ error: 'Invalid application ID' });
    }

    // Fetch application data
    const getQuery = 'SELECT * FROM application WHERE id = ?';
    con.query(getQuery, [id], async (err, results) => {
        if (err) {
            console.error('Database fetch error:', err);
            return res.status(500).json({ error: 'Error fetching application' });
        }
        if (results.length === 0) {
            console.error('No application found for ID:', id);
            return res.status(404).json({ error: 'Application not found' });
        }

        const application = results[0];
        console.log('Application found:', application);

        // Delete from application
        con.query('DELETE FROM application WHERE id = ?', [id], async (deleteErr) => {
            if (deleteErr) {
                console.error('Database delete error:', deleteErr);
                return res.status(500).json({ error: 'Failed to reject pass' });
            }

           try {
          await sendEmail(
            application.email,
            'Bus Pass Rejected',
            `Dear ${application.fname},\n\nYour bus pass application has been rejected.\nPlease contact support for more details.\n\nThank you,\nBus Pass System`
          );
          res.json({ message: 'Pass rejected and notification sent' });
        } catch (emailError) {
          console.error('Email error:', emailError);
          res.status(200).json({ message: 'Pass rejected but failed to send notification', emailError: emailError.message });
        }
        });
    });
});

// Renewal Form Submission (unchanged, included for reference)
app.post('/renew', upload.fields([
    { name: 'payment', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
    { name: 'aadhar', maxCount: 1 },
    { name: 'id-proof', maxCount: 1 },
    { name: 'bonafide', maxCount: 1 }
  ]), (req, res) => {
    const { fname, email, phone, dob, gender, address, source, destination, course, year, passNumber, expiryDate, renewalPeriod } = req.body;
    const amount = passPrices[destination]?.[source]?.[renewalPeriod];
    if (!amount) {
      console.log('Invalid selection:', { destination, source, renewalPeriod });
      return res.send('Invalid selection, please try again.');
    }
    const paymentPath = req.files['payment'] ? req.files['payment'][0].filename : null;
    const photoPath = req.files['photo'] ? req.files['photo'][0].filename : null;
    const aadharPath = req.files['aadhar'] ? req.files['aadhar'][0].filename : null;
    const idProofPath = req.files['id-proof'] ? req.files['id-proof'][0].filename : null;
    const bonafidePath = req.files['bonafide'] ? req.files['bonafide'][0].filename : null;
    const query = `
      INSERT INTO renewal (fname, email, phone, dob, gender, address, source, destination, course, year, passNumber, expiryDate, renewalPeriod, amount, paymentPath, photoPath, aadharPath, idProofPath, bonafidePath)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [fname, email, phone, dob, gender, address, source, destination, course, year, passNumber, expiryDate, renewalPeriod, amount, paymentPath, photoPath, aadharPath, idProofPath, bonafidePath];
    console.log('Inserting renewal:', values);
    con.query(query, values, (err) => {
      if (err) {
        console.error('Error inserting data:', err);
        return res.status(500).send('Database error');
      }
      console.log('Renewal inserted successfully');
      res.redirect('/homee');
    });
  });
  
  // Admin Renewal Enquiries (unchanged, included for reference)
  app.get('/admin-renewal-enquiries', (req, res) => {
    const query = `
      SELECT id, fname, email, phone, dob, gender, address, source, destination,
             course, year, passNumber, expiryDate, renewalPeriod, amount,
             paymentPath, photoPath, aadharPath, idProofPath, bonafidePath
      FROM renewal
    `;
    con.query(query, (err, result) => {
      if (err) {
        console.error('Error fetching renewals:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }
      console.log('Fetched renewals:', result.length, 'records');
      res.json({ success: true, applications: result });
    });
  });
  
  // Approve Renewal (consolidated and fixed)
 // Approve Renewal
app.post('/admin/approve-renewal/:id', (req, res) => {
    const id = req.params.id;

    // Validate ID
    if (!id || isNaN(id)) {
        return res.status(400).json({ success: false, message: 'Invalid or missing renewal ID' });
    }

    const fetchQuery = 'SELECT * FROM renewal WHERE id = ?';
    con.query(fetchQuery, [id], (err, rows) => {
        if (err || rows.length === 0) {
            console.error('Fetch error:', err || 'No renewal found');
            return res.status(404).json({ success: false, message: 'Renewal not found' });
        }

        const data = rows[0];
        const insertQuery = `
            INSERT INTO manage_pass (
                fname, email, phone, dob, gender, address, source, destination, course, year,
                passNumber, expiryDate, renewalPeriod, amount, photoPath
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            data.fname, data.email, data.phone, data.dob, data.gender, data.address,
            data.source, data.destination, data.course, data.year, data.passNumber,
            calculateExpiryDate(data.renewalPeriod), data.renewalPeriod, data.amount,
            data.photoPath
        ];

        con.query(insertQuery, values, (err2) => {
            if (err2) {
                console.error('Insert error into manage_pass:', err2);
                return res.status(500).json({ success: false, message: `Failed to insert into manage_pass: ${err2.message}` });
            }

            con.query('DELETE FROM renewal WHERE id = ?', [id], (err3) => {
                if (err3) {
                    console.error('Delete from renewal failed:', err3);
                    return res.status(500).json({ success: false, message: `Failed to delete renewal: ${err3.message}` });
                }

                console.log(`Renewal ${id} approved and moved to manage_pass`);
                res.json({ success: true, message: 'Renewal approved and moved to manage_pass' });
            });
        });
    });
});
  // Reject Renewal (consolidated and fixed)
  app.post('/admin/reject-renewal/:id', (req, res) => {
    const id = req.params.id;
    con.query('DELETE FROM renewal WHERE id = ?', [id], (err) => {
      if (err) {
        console.error('Reject deletion failed:', err);
        return res.status(500).json({ success: false, message: 'Failed to delete rejected renewal' });
      }
      console.log(`Renewal ${id} rejected and removed`);
      res.json({ success: true, message: 'Renewal rejected and removed' });
    });
  });

app.post('/admin/approve/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    console.log(`Received request: ${req.originalUrl}, type: ${type}, id: ${id}`);

    // Validate type
    if (!['application', 'renewal'].includes(type)) {
        console.log('Invalid type:', type);
        return res.status(400).json({ error: 'Invalid type. Must be "application" or "renewal"' });
    }

    // Validate id
    if (!validator.isInt(id, { min: 1 })) {
        console.log('Invalid ID:', id);
        return res.status(400).json({ error: 'Invalid ID. Must be a positive integer' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        let query, values, sourceTable, applicationType;
        const passNumber = generatePassNumber();

        // Fetch and validate data
        const selectQuery = type === 'application'
            ? `SELECT * FROM applications WHERE id = ?`
            : `SELECT * FROM renewal WHERE id = ?`;
        const [selectResults] = await connection.query(selectQuery, [id]);
        if (selectResults.length === 0) {
            throw new Error(`No record found in ${type === 'application' ? 'applications' : 'renewal'} with ID: ${id}`);
        }
        const record = selectResults[0];
        console.log(`Selected ${type} data:`, record);

        // Validate and prepare amount for renewals
        let amount = null;
        if (type === 'renewal') {
            const validRenewalPeriods = ['monthly', 'quarterly', 'yearly'];
            if (!validRenewalPeriods.includes(record.renewalPeriod)) {
                throw new Error(`Invalid renewalPeriod: ${record.renewalPeriod}`);
            }
            amount = passPrices[record.source]?.[record.destination]?.[record.renewalPeriod];
            if (!amount) {
                throw new Error(`Invalid source/destination/renewalPeriod: ${record.source}/${record.destination}/${record.renewalPeriod}`);
            }
        }

        // Set and validate applicationType
        applicationType = type === 'application' ? 'new' : 'renewal';
        console.log(`Setting applicationType to: ${applicationType} for type: ${type}`);
        if (!['new', 'renewal'].includes(applicationType)) {
            throw new Error(`Invalid applicationType: ${applicationType}`);
        }

        if (type === 'application') {
            sourceTable = 'applications';
            query = `
                INSERT INTO manage_pass (
                    fname, email, phone, dob, gender, address, source, destination, 
                    course, year, photoPath, passNumber, expiryDate, renewalPeriod, amount, 
                    application_type, status
                )
                SELECT COALESCE(fname, SUBSTRING_INDEX(email, '@', 1)) AS fname, 
                       email, phone, dob, gender, address, source, destination, 
                       course, year, photoPath, COALESCE(passNumber, ?) AS passNumber, 
                       expiryDate, NULL AS renewalPeriod, NULL AS amount, ? AS application_type, 'approved'
                FROM applications 
                WHERE id = ?
            `;
            values = [passNumber, applicationType, id];
        } else {
            sourceTable = 'renewal';
            query = `
                INSERT INTO manage_pass (
                    fname, email, phone, dob, gender, address, source, destination, 
                    course, year, photoPath, passNumber, expiryDate, renewalPeriod, amount, 
                    application_type, status
                )
                SELECT COALESCE(
                           fname, 
                           (SELECT fname FROM manage_pass WHERE email = renewal.email AND application_type = 'new' LIMIT 1),
                           SUBSTRING_INDEX(email, '@', 1)
                       ) AS fname, 
                       email, phone, dob, gender, address, source, destination, 
                       course, year, photoPath, COALESCE(passNumber, ?) AS passNumber, 
                       expiryDate, renewalPeriod, ? AS amount, ? AS application_type, 'approved'
                FROM renewal 
                WHERE id = ?
            `;
            values = [passNumber, amount, applicationType, id];
        }

        console.log(`Executing query with applicationType: ${applicationType}, values:`, values);

        const [result] = await connection.query(query, values);
        if (result.affectedRows === 0) {
            throw new Error(`Record not found in ${sourceTable} with ID: ${id}`);
        }

        // Verify insertion
        const [insertedRecord] = await connection.query(
            `SELECT id, passNumber, email, application_type, amount, renewalPeriod FROM manage_pass WHERE passNumber = ?`,
            [passNumber]
        );
        if (insertedRecord.length === 0) {
            throw new Error(`Failed to verify inserted record for passNumber: ${passNumber}`);
        }
        console.log(`Inserted record in manage_pass:`, insertedRecord[0]);

        await connection.query(`DELETE FROM ${sourceTable} WHERE id = ?`, [id]);
        await connection.commit();
        console.log(`${type} approved and moved to manage_pass with ID: ${id}, passNumber: ${passNumber}, application_type: ${insertedRecord[0].application_type}`);
        res.json({ success: true, message: `${type} approved and moved to manage_pass`, passNumber, application_type: insertedRecord[0].application_type });
    } catch (error) {
        await connection.rollback();
        console.error(`Error approving ${type} with ID: ${id}:`, error);
        res.status(500).json({ error: `Failed to approve ${type}: ${error.message}` });
    } finally {
        connection.release();
    }
}); 

// Admin Login
app.post('/admin-login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email and password are required' });
    }
    con.query('SELECT * FROM admins WHERE email = ? AND password = ?', [email, password], (err, result) => {
        if (err) {
            console.error('Admin login error:', err);
            return res.status(500).json({ success: false, error: 'Database error' });
        }
        if (result.length > 0) {
            return res.json({ success: true });
        } else {
            return res.json({ success: false, error: 'Invalid email or password' });
        }
    });
});

// Change Admin Password
app.post('/change-admin-password', (req, res) => {
    const { email, currentPassword, newPassword } = req.body;
    if (!email || !currentPassword || !newPassword) {
        return res.status(400).json({ success: false, error: 'Email, current password, and new password are required' });
    }
    if (newPassword.length < 8) {
        return res.status(400).json({ success: false, error: 'New password must be at least 8 characters long' });
    }
    con.query('SELECT * FROM admins WHERE email = ? AND password = ?', [email, currentPassword], (err, result) => {
        if (err) {
            console.error('Password change error:', err);
            return res.status(500).json({ success: false, error: 'Database error' });
        }
        if (result.length === 0) {
            return res.status(401).json({ success: false, error: 'Wrong password or email' });
        }
        const updateQuery = 'UPDATE admins SET password = ? WHERE email = ?';
        con.query(updateQuery, [newPassword, email], (err2) => {
            if (err2) {
                console.error('Password update error:', err2);
                return res.status(500).json({ success: false, error: 'Failed to update password' });
            }
            res.json({ success: true, message: 'Password updated successfully' });
        });
    });
});

// About Us Content Management
const aboutFilePath = path.join(__dirname, 'aboutContent.json');
app.post('/update-about', (req, res) => {
    const { aboutText } = req.body;
    if (!aboutText || aboutText.trim() === '') {
        return res.status(400).send('About text is required.');
    }
    const newAboutContent = { aboutText };
    fs.writeFile(aboutFilePath, JSON.stringify(newAboutContent, null, 2), (err) => {
        if (err) {
            console.error('Error saving About content:', err);
            return res.status(500).send('Error saving About content.');
        }
        res.json(newAboutContent);
    });
});

app.get('/about', (req, res) => {
    fs.readFile(aboutFilePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading About content:', err);
            return res.status(500).send('Error reading About content.');
        }
        res.json(JSON.parse(data));
    });
});

// Contact Us Content Management
let contactContent = {
    pageTitle: 'Contact Us',
    pageDescription: 'For any queries, contact us through the details below.',
    email: 'admin@example.com',
    mobile: '876543287'
};

app.get('/contact', (req, res) => res.json(contactContent));

app.post('/contact', (req, res) => {
    const { pageTitle, pageDescription, email, mobile } = req.body;
    contactContent = { pageTitle, pageDescription, email, mobile };
    res.json({ message: 'Changes saved successfully!', contactContent });
});

app.get('/api/applicants/by-email/:email', async (req, res) => {
    try {
        const { email } = req.params;
        if (!validator.isEmail(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }
        const [applicant] = await con.promise().query(
            `SELECT id, email, passNumber, fname, source, destination, course, year, renewalPeriod, 
                    DATE_FORMAT(expiryDate, '%Y-%m-%d') AS expiryDate, photoPath, status
             FROM manage_pass
             WHERE email = ? AND status = 'approved'`,
            [email]
        );
        if (!applicant.length) {
            return res.status(404).json({ error: 'Applicant not found' });
        }
        res.json(applicant[0]);
    } catch (error) {
        console.error('Error fetching applicant by email:', error);
        res.status(500).json({ error: `Internal server error: ${error.message}` });
    }
});
// Fetch Passes by Category (New Endpoint)
app.get('/api/passes/:category', async (req, res) => {
    try {
        const { category } = req.params;
        if (!['monthly', 'quarterly', 'yearly'].includes(category)) {
            return res.status(400).json({ error: 'Invalid category' });
        }
        const [passes] = await con.promise().query(
            `SELECT id, email, passNumber, fname, source, destination, course, year, renewalPeriod, 
                    DATE_FORMAT(expiryDate, '%Y-%m-%d') AS expiryDate, photoPath, pdfPath
             FROM manage_pass
             WHERE pass_type = ? AND status = 'generated'`,
            [category]
        );
        res.json({ success: true, passes });
    } catch (error) {
        console.error('Error fetching passes by category:', error);
        res.status(500).json({ error: `Internal server error: ${error.message}` });
    }
});
// Function to insert a generated pass
async function insertGeneratedPass(db, passNumber, pdfPath, generatedAt) {
    try {
        const query = `
            INSERT INTO generated_passes (passNumber, pdfPath, generated_at)
            VALUES (?, ?, ?)
        `;
        const values = [passNumber, pdfPath, generatedAt];

        const [result] = await db.execute(query, values);
        console.log(`Pass inserted successfully with ID: ${result.insertId}`);
        return result.insertId;
    } catch (error) {
        console.error('Error inserting pass:', error.message);
        throw new Error(`Failed to insert pass: ${error.message}`);
    }
}


// Assuming you're using a MongoDB model called Photo
async function getPhotoById(photoId) {
  try {
    const existingPhoto = await Photo.findById(photoId);
    if (!existingPhoto) {
      throw new Error('Photo not found');
    }
    return existingPhoto;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

// Example usage in your route or function
app.get('/photo/:id', async (req, res) => {
  try {
    const photoId = req.params.id;
    const existingPhoto = await getPhotoById(photoId);

    const id = existingPhoto._id; // or existingPhoto.id depending on your DB
    const dbPhotoPath = existingPhoto.photoPath;

    res.json({ id, dbPhotoPath });
  } catch (error) {
    res.status(404).json({ error: 'Photo not found' });
  }
});

// Function to generate the pass PDF
async function generatePass(data, photoPath, outputPath) {
  const doc = new PDFDocument({ size: 'A4' });
  const writeStream = fs.createWriteStream(outputPath);
  doc.pipe(writeStream);

  const pageWidth = 595.28;
  const pageHeight = 541.89;
  const margin = 50;

  // Photo: Top right
  const photoWidth = 100;
  const photoHeight = 100;
  const photoX = pageWidth - photoWidth - margin; // Align to right
  const photoY = margin; // Align to top
  try {
    await fs.access(photoPath); // Verify photo exists
    doc.image(photoPath, photoX, photoY, { width: photoWidth, height: photoHeight });
  } catch (error) {
    console.error('Photo not found:', photoPath);
    doc.text('Photo not found', photoX, photoY);
  }

  // QR Code: Top left
  const qrWidth = 100;
  const qrHeight = 100;
  const qrX = margin; // Left margin
  const qrY = margin; // Top margin
  try {
    const qrCodeBuffer = await QRCode.toBuffer(data.passNumber, { width: qrWidth });
    doc.image(qrCodeBuffer, qrX, qrY, { width: qrWidth, height: qrHeight });
  } catch (error) {
    console.error('QR code generation failed:', error);
    doc.text('QR code error', qrX, qrY);
  }

  // Text details
  doc.fontSize(12).text(`Name: ${data.fname}`, margin, qrY + qrHeight + 20);
  doc.text(`Email: ${data.email}`, margin, qrY + qrHeight + 40);
  doc.text(`Pass Number: ${data.passNumber}`, margin, qrY + qrHeight + 60);
  // Add other fields...

  doc.end();
  await new Promise((resolve) => writeStream.on('finish', resolve));
}

// Pass generation route
app.post('/admin/pass-generate', (req, res) => {
    console.log('Received /admin/pass-generate:', req.body);
    const {
        email,
        passNumber = generatePassNumber(),
        fname,
        source,
        destination,
        course,
        year,
        renewalPeriod,
        expiryDate,
        photoPath
    } = req.body;

    // Validate required fields
    if (!email || !passNumber || !fname || !source || !destination || !course || !year || !renewalPeriod || !expiryDate || !photoPath) {
        console.log('Validation failed: Missing fields', {
            email, passNumber, fname, source, destination, course, year, renewalPeriod, expiryDate, photoPath
        });
        return res.status(400).json({ error: 'All fields are required, including photoPath' });
    }
    if (!validator.isEmail(email)) {
        console.log('Validation failed: Invalid email', email);
        return res.status(400).json({ error: 'Invalid email format' });
    }
    if (!['monthly', 'quarterly', 'yearly'].includes(renewalPeriod)) {
        console.log('Validation failed: Invalid renewalPeriod', renewalPeriod);
        return res.status(400).json({ error: 'Invalid renewal period' });
    }
    const expiry = new Date(expiryDate);
    if (isNaN(expiry.getTime())) {
        console.log('Validation failed: Invalid expiryDate', expiryDate);
        return res.status(400).json({ error: 'Invalid expiry date' });
    }

    // Verify photo exists
    const fullPhotoPath = path.join(__dirname, 'uploads', photoPath);
    if (!fs.existsSync(fullPhotoPath)) {
        console.error('Photo file not found at:', fullPhotoPath);
        return res.status(400).json({ error: 'User’s photo not found' });
    } 

    console.log('Generating PDF for passNumber:', passNumber);
    const doc = new PDFDocument({ size: 'A5', margin: 10 });
    const safePassNumber = passNumber.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `pass_${safePassNumber}_${Date.now()}.pdf`;
    const filePath = path.join(__dirname, 'public', 'passes', fileName);

    const passesDir = path.join(__dirname, 'public', 'passes');
    if (!fs.existsSync(passesDir)) {
        console.log('Creating passes directory:', passesDir);
        fs.mkdirSync(passesDir, { recursive: true });
    }

    doc.pipe(fs.createWriteStream(filePath));
    doc.fillColor('#d32f2f').rect(0, 0, 148 * 2.83, 30).fill();
    doc.fontSize(14).fillColor('white').text('TSRTC BUS PASS', 10, 10, { align: 'center' });
    doc.fillColor('black').fontSize(10);

    const formattedExpiry = `${expiry.getDate().toString().padStart(2, '0')}/${(expiry.getMonth() + 1).toString().padStart(2, '0')}/${expiry.getFullYear()}`;
    console.log('Formatted expiry date for PDF:', formattedExpiry);

    doc.text(`Pass Number: ${passNumber}`, 20, 40);
    doc.text(`Name: ${fname}`, 20, 50);
    doc.text(`Email: ${email}`, 20, 60);
    doc.text(`Route: ${source} to ${destination}`, 20, 70);
    doc.text(`Course: ${course}, ${year}`, 20, 80);
    doc.text(`Pass Type: ${renewalPeriod.toUpperCase()}`, 20, 90);
    doc.text(`Valid Until: ${formattedExpiry}`, 20, 100);
    
    try {
        // Add the photo at top right
        const photoWidth = 99;
        const photoHeight = 99;
        const photoX = doc.page.width - photoWidth - 50;
        const photoY = 30;
        doc.image(fullPhotoPath, photoX, photoY, { width: photoWidth, height: photoHeight });
        console.log('Passport photo added to PDF at:', fullPhotoPath);
    } catch (imageError) {
        console.error('Error adding passport photo to PDF:', imageError);
        doc.text('Photo Error', 90 * 2.83, 95 * 2.83);
    }

    console.log('Generating QR code');
    QRCode.toDataURL(JSON.stringify({ passNumber, fname, expiryDate }), (err, qrCode) => {
        if (err) {
            console.error('QR code generation failed:', err);
            doc.end();
            return res.status(500).json({ error: 'Failed to generate QR code' });
        }

        // Place QR code and text on the same page
        const qrWidth = 56;
        const qrX = (doc.page.width - qrWidth) / 2;
        const qrY = 500;
        doc.image(qrCode, qrX, qrY, { width: qrWidth });
        doc.fontSize(8).text('Non-transferable. Issued by TSRTC.', 0, qrY + qrWidth + 10, { align: 'center', width: doc.page.width });
        doc.end();

        console.log('PDF saved at:', filePath);
        generatedPasses.set(passNumber, {
            passNumber,
            pdfPath: `/passes/${fileName}`,
            generated_at: new Date().toISOString()
        });

        // Start a transaction
        con.query('START TRANSACTION', (err) => {
            if (err) {
                console.error('Error starting transaction:', err.message);
                return res.status(500).json({ error: 'Database error' });
            }

            // Insert into generated_passes
            con.query(
                'INSERT INTO generated_passes (source, destination, passNumber, pdfPath, expiryDate, generated_at) VALUES (?, ?, ?, ?, ?, ?)',
                [source, destination, passNumber, `/passes/${fileName}`, expiryDate, new Date()],
                (err, result) => {
                    if (err) {
                        console.error('Database insertion error:', err);
                        con.query('ROLLBACK', () => {});
                        return res.status(500).json({ error: `Database error: ${err.message}` });
                    }

                    // Delete from manage_pass
                    con.query('DELETE FROM manage_pass WHERE LOWER(email) = ?', [email.toLowerCase()], (err, deleteResult) => {
                        if (err) {
                            console.error('Error deleting application:', err.message);
                            con.query('ROLLBACK', () => {});
                            return res.status(500).json({ error: `Database error: ${err.message}` });
                        }

                        // Commit the transaction
                        con.query('COMMIT', (err) => {
                            if (err) {
                                console.error('Error committing transaction:', err.message);
                                con.query('ROLLBACK', () => {});
                                return res.status(500).json({ error: `Database error: ${err.message}` });
                            }

                            res.json({ 
                                success: true,
                                passId: result.insertId,
                                pdfPath: `/passes/${fileName}`
                            });
                        });
                    });
                }
            );
        });
    });
});


// Existing /pass-generator endpoint
app.get('/pass-generator', (req, res) => {
    const email = req.query.email;

    if (!email) {
        return res.status(400).send('Email is required');
    }

    // Update status to 'generated' in manage_pass table
    const query = 'UPDATE manage_pass SET status = ? WHERE LOWER(email) = ? AND status = ?';
    con.query(query, ['generated', email.toLowerCase(), 'approved'], (err, result) => {
        if (err) {
            console.error('Error updating pass status:', err);
            return res.status(500).send('Database error');
        }

        if (result.affectedRows === 0) {
            return res.status(400).send('Pass already generated or not found');
        }

        // Redirect back to manage-pass page
        res.redirect('/manage-pass.html');
    });
});
// API endpoint for user data (updated from /api/applicants/by-email/:email)
app.get('/api/users/by-email/:email', async (req, res) => {
    const { email } = req.params;
    if (!validator.isEmail(email)) {
        console.log('Invalid email format:', email);
        return res.status(400).json({ error: 'Invalid email format' });
    }
    try {
        const user = users.get(email);
        if (!user || user.status !== 'approved') {
            console.log('No approved user found for email:', email);
            return res.status(404).json({ error: 'No approved user found' });
        }
        res.json({
            email: user.email,
            passNumber: user.passNumber || null,
            fname: user.fname,
            source: user.source,
            destination: user.destination,
            course: user.course,
            year: user.year,
            renewalPeriod: user.renewalPeriod,
            expiryDate: user.expiryDate,
            photoPath: user.photoPath || null
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/admin/generated-passes', (req, res) => {
    const query = `
        SELECT g.id, g.passNumber, g.pdfPath, g.generated_at,
               m.fname, m.email, m.source, m.destination, m.course, m.year,
               m.renewalPeriod, m.expiryDate, m.application_type, m.amount, m.status
        FROM generated_passes g
        JOIN manage_pass m ON g.passNumber = m.passNumber
        ORDER BY g.generated_at DESC
    `;
    con.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching generated passes:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        res.json({
            success: true,
            passes: results
        });
    });
});
app.get('/admin-today-pass', (req, res) => {
   const startOfDay = moment().tz('Asia/Kolkata').startOf('day').format('YYYY-MM-DD HH:mm:ss');
    const endOfDay = moment().tz('Asia/Kolkata').endOf('day').format('YYYY-MM-DD HH:mm:ss');
    

    con.query(
        `SELECT COUNT(*) AS total 
         FROM generated_passes 
         WHERE generated_at >= ? AND generated_at <= ?`,
        [startOfDay, endOfDay],
        (err, result) => {
            if (err) {
                console.error('Query error (today):', err.message);
                return res.status(500).json({ success: false, message: err.message });
            }
            res.json({ success: true, total: result[0].total, message: 'Success' });
        }
    );
});

app.get('/admin-yesterday-pass', (req, res) => {
     const startOfYesterday = moment().tz('Asia/Kolkata').subtract(1, 'days').startOf('day').format('YYYY-MM-DD HH:mm:ss');
    const endOfYesterday = moment().tz('Asia/Kolkata').subtract(1, 'days').endOf('day').format('YYYY-MM-DD HH:mm:ss');
   
    con.query(
        `SELECT COUNT(*) AS total 
         FROM generated_passes 
         WHERE generated_at >= ? AND generated_at <= ?`,
        [startOfYesterday, endOfYesterday],
        (err, result) => {
            if (err) {
                console.error('Query error (yesterday):', err.message);
                return res.status(500).json({ success: false, message: err.message });
            }
            res.json({ success: true, total: result[0].total, message: 'Success' });
        }
    );
});

app.get('/admin-last7days-pass', (req, res) => {
       const startOf7Days = moment().tz('Asia/Kolkata').subtract(6, 'days').startOf('day').format('YYYY-MM-DD HH:mm:ss');
    const endOfToday = moment().tz('Asia/Kolkata').endOf('day').format('YYYY-MM-DD HH:mm:ss');

    
    con.query(
        `SELECT COUNT(*) AS total 
         FROM generated_passes 
         WHERE generated_at >= ? AND generated_at <= ?`,
        [startOf7Days, endOfToday],
        (err, result) => {
            if (err) {
                console.error('Query error (last 7 days):', err.message);
                return res.status(500).json({ success: false, message: err.message });
            }
            res.json({ success: true, total: result[0].total, message: 'Success' });
        }
    );
});


app.post('/search-pass', async (req, res) => {
    try {
        const { passNumber } = req.body;

        if (!passNumber) {
            return res.status(400).json({ 
                success: false, 
                message: 'Pass number is required' 
            });
        }

        // Query with all possible field names
        const query = `
            SELECT 
                passNumber,
                source,
                destination,
                expiryDate
            FROM generated_passes 
            WHERE passNumber = ?
        `;

        con.query(query, [passNumber], (err, results) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Database error',
                    error: err.message 
                });
            }

            // Format dates before sending response
            const formattedResults = results.map(pass => ({
                ...pass,
                expiryDate: pass.expiryDate ? new Date(pass.expiryDate).toISOString() : null
            }));

            res.json({ 
                success: true,
                passes: formattedResults,
                message: results.length ? 'Pass found' : 'No passes found'
            });
        });

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error',
            error: error.message 
        });
    }
});
app.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
});