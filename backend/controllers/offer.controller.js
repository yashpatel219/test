import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import playwright from 'playwright';
import User from '../models/User.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const generateAndSendOffer = async (req, res) => {
  let browser;

  try {
    const { userId, email, name } = req.body;

    // Validate required fields
    if (!userId || !email || !name) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Fetch full user from DB
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('Generating offer for:', { userId, name, email });

    const date = new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    // 1️⃣ Load HTML template
    const templatePath = path.join(__dirname, '../templates/offer.html');
    if (!fs.existsSync(templatePath)) {
      return res.status(500).json({ message: 'Offer template not found' });
    }

    const offerContent = fs.readFileSync(templatePath, 'utf8');
    const processedHtml = offerContent
      .replace(/{{name}}/g, name)
      .replace(/{{date}}/g, date);

    // 2️⃣ Generate PDF using Playwright
    browser = await playwright.chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'] // Add these args for stability
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();

    // Set content with more lenient options
    try {
      await page.setContent(processedHtml, { 
        waitUntil: 'domcontentloaded', // Changed from networkidle
        timeout: 60000 // Increased timeout
      });
    } catch (err) {
      console.error('Error setting HTML content:', err);
      // Try without waitUntil as fallback
      await page.setContent(processedHtml);
    }

    let pdfBuffer;
    try {
      pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
        timeout: 60000 // Add timeout to PDF generation too
      });
    } catch (err) {
      console.error('PDF generation failed:', err);
      return res.status(500).json({ message: 'PDF generation failed', error: err.message });
    }

    // 3️⃣ Send email
    const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: process.env.MAIL_PORT,
  secure: process.env.MAIL_PORT == 465, // true for SSL (465), false for TLS (587)
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});


    try {
     await transporter.sendMail({
  from: `"HR Team" <${process.env.MAIL_FROM}>`,
  to: email,
  subject: `Your Offer Letter - ${name}`,
  text: `Dear ${name},\n\nPlease find your official offer letter attached.\n\nBest regards,\nHR Team`,
  attachments: [
    {
      filename: `Offer_Letter_${name.replace(/\s+/g, '_')}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    },
  ],
});

    } catch (err) {
      console.error('Email sending failed:', err);
      return res.status(500).json({ message: 'Failed to send email', error: err.message });
    }

    console.log('Offer letter generated and sent successfully for:', email);

    // 4️⃣ Respond success
    res.status(200).json({
      success: true,
      message: 'Offer letter generated and sent successfully',
    });
  } catch (error) {
    console.error('Error in generateAndSendOffer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate and send offer letter',
      error: error.message,
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};


