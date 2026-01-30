# Domain Setup Guide for memo-chess.com

## Step 1: Purchase Domain on Namecheap

1. Go to [Namecheap.com](https://www.namecheap.com)
2. Search for `memo-chess.com` (or `memo-chess-cm` if that's what you found)
3. Add to cart and complete purchase
4. Go to your Namecheap account → Domain List → Manage

## Step 2: Configure Domain in Vercel

1. **Go to Vercel Dashboard**
   - Navigate to your project: `memo-chess` (or `blindfolded-chess-app-z9n3`)
   - Go to **Settings** → **Domains**

2. **Add Domain**
   - Click **Add Domain**
   - Enter: `memo-chess.com`
   - Click **Add**

3. **Vercel will show DNS records needed:**
   - Usually just an **A Record** or **CNAME**
   - Copy the values shown

## Step 3: Configure DNS at Namecheap

1. **Go to Namecheap Domain Management**
   - Click on your domain
   - Go to **Advanced DNS** tab

2. **Add DNS Records:**
   
   **For Root Domain (memo-chess.com):**
   - **Type**: A Record
   - **Host**: `@`
   - **Value**: (Use the IP address Vercel provides, usually `76.76.21.21`)
   - **TTL**: Automatic (or 300)
   
   **OR use CNAME (recommended by Vercel):**
   - **Type**: CNAME Record
   - **Host**: `@`
   - **Value**: `cname.vercel-dns.com`
   - **TTL**: Automatic

   **For WWW subdomain (www.memo-chess.com):**
   - **Type**: CNAME Record
   - **Host**: `www`
   - **Value**: `cname.vercel-dns.com`
   - **TTL**: Automatic

3. **Save Changes**

## Step 4: Wait for DNS Propagation

- DNS changes can take 5 minutes to 48 hours
- Usually takes 10-30 minutes
- Check status in Vercel dashboard (will show "Valid Configuration" when ready)

## Step 5: Verify Domain Works

1. Visit `https://memo-chess.com` (should load your site)
2. Visit `https://www.memo-chess.com` (should redirect or load)
3. Check SSL certificate (should be automatic via Vercel)

## Step 6: Update Webhook URLs (if needed)

After domain is live, update any external services:

1. **Dodo Payments Webhook:**
   - Old: `https://memo-chess.vercel.app/api/dodo-webhook`
   - New: `https://memo-chess.com/api/dodo-webhook`
   - Update in Dodo Payments dashboard

2. **Supabase Redirect URLs:**
   - Add `https://memo-chess.com` to allowed redirect URLs
   - Supabase Dashboard → Authentication → URL Configuration

## Step 7: Test Everything

- ✅ Site loads on custom domain
- ✅ Login/registration works
- ✅ Payment redirects work
- ✅ Webhooks still function
- ✅ SSL certificate is valid (green padlock)

## Troubleshooting

**Domain not working?**
- Check DNS records are correct in Namecheap
- Wait longer for propagation (can take up to 48 hours)
- Verify domain is added correctly in Vercel

**SSL certificate issues?**
- Vercel automatically provisions SSL certificates
- Wait 5-10 minutes after DNS propagation
- Check Vercel dashboard for SSL status

**Subdomain not working?**
- Make sure CNAME record for `www` is added
- Vercel will automatically redirect www to root domain

