import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransporter({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
};

// Email templates
export const emailTemplates = {
  welcome: (user) => ({
    subject: 'Welcome to LiberiaClearLogistics!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0056b3, #28a745); padding: 30px; text-align: center; color: white;">
          <h1>Welcome to LiberiaClearLogistics!</h1>
        </div>
        <div style="padding: 30px; background: #f8f9fa;">
          <h2>Dear ${user.companyName},</h2>
          <p>Thank you for registering with LiberiaClearLogistics - your trusted partner for customs clearing and freight forwarding in Liberia.</p>
          
          <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h3>Your Account Details:</h3>
            <p><strong>Company:</strong> ${user.companyName}</p>
            <p><strong>Email:</strong> ${user.email}</p>
            <p><strong>Phone:</strong> ${user.phone}</p>
          </div>

          <p>With your account, you can:</p>
          <ul>
            <li>Track shipments in real-time</li>
            <li>Get instant quotes</li>
            <li>Access your documents</li>
            <li>Communicate with your dedicated agent</li>
          </ul>

          <p>If you have any questions, please don't hesitate to contact our support team.</p>
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="${process.env.CLIENT_URL}" 
               style="background: #0056b3; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Access Your Portal
            </a>
          </div>
        </div>
        <div style="background: #333; color: white; padding: 20px; text-align: center;">
          <p>LiberiaClearLogistics &copy; 2024</p>
          <p>Freeport of Monrovia Area, Monrovia, Liberia</p>
          <p>Phone: +231-88-123-4567 | Email: info@liberiacclearlogistics.com</p>
        </div>
      </div>
    `
  }),

  shipmentUpdate: (shipment, user) => ({
    subject: `Shipment Update: ${shipment.trackingNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0056b3, #28a745); padding: 30px; text-align: center; color: white;">
          <h1>Shipment Status Update</h1>
        </div>
        <div style="padding: 30px; background: #f8f9fa;">
          <h2>Hello ${user.companyName},</h2>
          <p>Your shipment status has been updated:</p>
          
          <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h3>Shipment Details:</h3>
            <p><strong>Tracking Number:</strong> ${shipment.trackingNumber}</p>
            <p><strong>Current Status:</strong> <span style="color: #28a745; font-weight: bold;">${shipment.status}</span></p>
            <p><strong>Description:</strong> ${shipment.description}</p>
            <p><strong>Last Update:</strong> ${new Date().toLocaleString()}</p>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <a href="${process.env.CLIENT_URL}/#tracking" 
               style="background: #0056b3; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Track Your Shipment
            </a>
          </div>
        </div>
      </div>
    `
  }),

  quoteResponse: (quote, user) => ({
    subject: `Quote Response: ${quote._id}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0056b3, #28a745); padding: 30px; text-align: center; color: white;">
          <h1>Quote Response</h1>
        </div>
        <div style="padding: 30px; background: #f8f9fa;">
          <h2>Dear ${user.companyName},</h2>
          <p>Thank you for your quote request. Here are the details:</p>
          
          <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h3>Quote Details:</h3>
            <p><strong>Service Type:</strong> ${quote.serviceType}</p>
            <p><strong>Origin:</strong> ${quote.origin}</p>
            <p><strong>Cargo Type:</strong> ${quote.cargoType}</p>
            <p><strong>Estimated Amount:</strong> $${quote.calculatedAmount} USD</p>
            <p><strong>Quote ID:</strong> ${quote._id}</p>
          </div>

          <p>Our team will contact you shortly to discuss the details.</p>
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="${process.env.CLIENT_URL}/#contact" 
               style="background: #0056b3; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Contact Us
            </a>
          </div>
        </div>
      </div>
    `
  })
};

// Send email function
export const sendEmail = async (emailData) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `LiberiaClearLogistics <${process.env.EMAIL_USERNAME}>`,
      to: emailData.to,
      subject: emailData.subject,
      html: emailData.html,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully to:', emailData.to);
    return result;
  } catch (error) {
    console.error('❌ Error sending email:', error);
    throw error;
  }
};

// Batch email sender
export const sendBulkEmails = async (emails) => {
  const results = [];
  
  for (const email of emails) {
    try {
      const result = await sendEmail(email);
      results.push({ success: true, email: email.to, result });
    } catch (error) {
      results.push({ success: false, email: email.to, error: error.message });
    }
  }
  
  return results;
};