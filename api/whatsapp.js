 // api/whatsapp.js — WhatsApp Cloud API webhook (Pasidu Max / Radiant Queen)
 // Does NOT touch api/telegram.js
 const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || '';
 const WA_TOKEN = process.env.WHATSAPP_TOKEN || '';
 const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';

 async function sendText(to, body) {
   if (!WA_TOKEN ||!PHONE_NUMBER_ID) {
     console.error('Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID');
     return;
   }
   const url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;
   const res = await fetch(url, {
     method: 'POST',
     headers: {
       Authorization: `Bearer ${WA_TOKEN}`,
       'Content-Type': 'application/json',
     },
     body: JSON.stringify({
       messaging_product: 'whatsapp',
       to,
       type: 'text',
       text: { body },
     }),
   });
   const data = await res.json().catch(() => ({}));
   if (!res.ok) console.error('WA send error', res.status, data);
   return data;
 }

 export default async function handler(req, res) {
   // --- Webhook verification (Meta Step 2) ---
   if (req.method === 'GET') {
     const mode = req.query['hub.mode'];
     const token = req.query['hub.verify_token'];
     const challenge = req.query['hub.challenge'];
     if (mode === 'subscribe' && token && token === VERIFY_TOKEN) {
       res.status(200).send(challenge);
       return;
     }
     res.status(403).send('Forbidden');
     return;
   }

   // --- Incoming messages ---
   if (req.method === 'POST') {
     try {
       const body = req.body || {};
       const value = body?.entry?.[0]?.changes?.[0]?.value;
       const msg = value?.messages?.[0];
       // Always 200 quickly so Meta does not retry forever
       res.status(200).json({ ok: true });
       if (!msg) return;
       const from = msg.from; // customer number
       const type = msg.type;
       if (type === 'text') {
         const text = (msg.text?.body || '').trim();
         const reply = `Ayubowan! Pasidu Max / Radiant Queen 👑\n\n` +
           `Thank you for contacting us.\n` +
           `We received: "${text.slice(0, 200)}"\n\n` +
           `Our team will get back to you soon.\n` +
           `Telegram bot: https://t.me/PasiyaMaxQueen_bot`;
         await sendText(from, reply);
       } else {
         await sendText(
           from,
           'Ayubowan! Thanks for your message. Please send text, or open https://t.me/PasiyaMaxQueen_bot'
         );
       }
     } catch (e) {
       console.error(e);
       if (!res.headersSent) res.status(200).json({ ok: true });
     }
     return;
   }
   res.status(405).send('Method not allowed');
 } 
