import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

// Hubtel SMS Gateway Configuration
export const hubtelConfig = {
  baseUrl: process.env.NODE_ENV === 'production' 
    ? 'https://api.hubtel.com/v1'
    : 'https://api.hubtel.com/v1',
  clientId: process.env.HUBTEL_CLIENT_ID,
  clientSecret: process.env.HUBTEL_CLIENT_SECRET,
  senderId: process.env.HUBTEL_SENDER_ID || 'LiberiaClear'
};

// mNotify SMS Gateway Configuration
export const mNotifyConfig = {
  baseUrl: 'https://api.mnotify.com/api',
  apiKey: process.env.MNOTIFY_API_KEY,
  senderId: process.env.MNOTIFY_SENDER_ID || 'LiberiaClear'
};

// Africa's Talking Configuration
export const africasTalkingConfig = {
  baseUrl: 'https://api.africastalking.com/version1',
  apiKey: process.env.AT_API_KEY,
  username: process.env.AT_USERNAME,
  senderId: process.env.AT_SENDER_ID || 'LiberiaClear'
};