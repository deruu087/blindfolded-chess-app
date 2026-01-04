# Code Paths Where Subscription Data Could Be Set Without Supabase

## Summary
This document lists **every possible code path** where subscription data could be set without coming from Supabase. This helps debug the 3.52 mock data issue.

---

## ✅ SAFE: `loadBillingInfo()` Function (Lines 1352-1750)
**Location:** `profile.html:1352-1750`

**Status:** ✅ **SAFE** - Only uses Supabase, no fallbacks
- Initializes `subscription = null` (line 1416)
- Only sets subscription from `window.getUserSubscription()` (line 1424)
- No localStorage fallbacks
- No default values
- Rejects 3.52 immediately

**Code:**
```javascript
let subscription = null;
if (typeof window.getUserSubscription === 'function') {
    subscription = await window.getUserSubscription();
    // Rejects 3.52 immediately
}
```

---

## ⚠️ POTENTIAL ISSUE: `updateSubscriptionStatus()` Function (Lines 2037-2149)
**Location:** `profile.html:2037-2149`

**Status:** ⚠️ **Uses localStorage fallback** but doesn't create subscription objects

**What it does:**
- Fetches subscription from Supabase (line 2054)
- **FALLBACK:** If Supabase fails, uses `localStorage.getItem('cachedSubscriptionStatus')` (line 2063, 2067)
- **FALLBACK:** If `hasActiveSubscription` is true but no subscription object, uses `localStorage.getItem('subscriptionPlan')` (line 2079)
- **Sets:** `userData.subscription = plan` (string, not object)

**Key Code:**
```javascript
// Line 2060-2063: Fallback to cached status
catch (e) {
    hasActiveSubscription = localStorage.getItem('cachedSubscriptionStatus') === 'true';
}

// Line 2077-2080: Fallback to localStorage plan
else if (hasActiveSubscription) {
    const plan = localStorage.getItem('subscriptionPlan') || 'monthly';
    userData.subscription = plan; // STRING, not object
}
```

**Impact:** This sets `userData.subscription` to a string ('monthly', 'quarterly', 'free'), NOT a subscription object. This should NOT affect `loadBillingInfo()`.

---

## ⚠️ POTENTIAL ISSUE: `showAccountInfoModal()` Function (Lines 2778-2921)
**Location:** `profile.html:2778-2921`

**Status:** ⚠️ **Uses localStorage fallback** but doesn't create subscription objects

**What it does:**
- Fetches subscription from Supabase (line 2789)
- **FALLBACK:** If Supabase fails, uses `localStorage.getItem('subscriptionPlan')` (line 2797, 2801)
- **Sets:** `subscriptionPlan` (string) and `hasActiveSubscription` (boolean)
- **Uses:** Hardcoded prices like `'€4.99'` and `'$12.99/quarter'` (lines 2815, 2880, 2901)

**Key Code:**
```javascript
// Line 2794-2797: Fallback to localStorage
catch (e) {
    subscriptionPlan = localStorage.getItem('subscriptionPlan') || 'free';
}

// Line 2813-2815: Hardcoded fallback price
const price = subscription.amount_paid ? 
    `${subscription.currency || 'EUR'} ${subscription.amount_paid}` : 
    (subscription.plan_type === 'monthly' ? '€4.99' : '€12.99');
```

**Impact:** This function is for the account info modal, NOT the billing page. It uses hardcoded prices but doesn't create subscription objects with `amount_paid = 3.52`.

---

## ⚠️ POTENTIAL ISSUE: `userData` Object Initialization (Line 1831-1838)
**Location:** `profile.html:1831-1838`

**Status:** ⚠️ **Uses localStorage** but only for plan name string

**What it does:**
- Initializes `userData.subscription` from `localStorage.getItem('subscriptionPlan')` (line 1834)
- Defaults to `"free"` if not found
- This is a STRING, not a subscription object

**Key Code:**
```javascript
let userData = {
    name: localStorage.getItem('userName') || "Guest User",
    email: localStorage.getItem('userEmail') || "guest@example.com",
    subscription: localStorage.getItem('subscriptionPlan') || "free", // STRING
    gamesPlayed: 0,
    trainingHours: 0,
    currentStreak: 0
};
```

**Impact:** This is a string ('free', 'monthly', 'quarterly'), NOT a subscription object. Should NOT affect `loadBillingInfo()`.

---

## ❌ NOT FOUND: Direct Subscription Object Creation
**Status:** ❌ **NO CODE FOUND** that creates subscription objects with `amount_paid = 3.52` from non-Supabase sources

**Searched for:**
- `subscription = { plan_type: ..., amount_paid: ... }`
- `subscription = { plan_type: ..., amount_paid: 3.52 }`
- `subscription = JSON.parse(localStorage.getItem('subscription'))`
- Any object literal with `amount_paid: 3.52`

**Result:** None found in `profile.html`

---

## 🔍 SUSPICIOUS: Browser Cache / Cached HTML
**Status:** 🔍 **MOST LIKELY CULPRIT**

**Possible Issues:**
1. **Cached JavaScript:** Browser might be loading old version of `profile.html` with mock data
2. **Cached HTML:** Browser might be restoring cached HTML content in `billings-content` div
3. **Service Worker:** If a service worker exists, it might be serving cached content

**Evidence:**
- User reports: "When I navigate to billing page via app, data is correct. When I refresh, I see old mock subscription."
- This suggests cached content is being served on refresh

---

## 🔍 SUSPICIOUS: Race Condition / Timing Issue
**Status:** 🔍 **POSSIBLE**

**Possible Issues:**
1. **Old code running:** If `loadBillingInfo()` is called before Supabase initializes, old cached code might run
2. **Multiple calls:** If `loadBillingInfo()` is called multiple times, an old version might run first
3. **Tab restoration:** Browser might restore tab state with old HTML

---

## 📋 CHECKLIST: Where to Look Next

1. ✅ **Check browser cache:** Hard refresh (`Cmd+Shift+R` on Mac, `Ctrl+Shift+R` on Windows)
2. ✅ **Check console logs:** Look for `🚀 loadBillingInfo() CALLED - VERSION 2.0` to confirm new code is running
3. ✅ **Check Supabase query:** Look for `📦 getUserSubscription RAW DATA FROM SUPABASE:` in console
4. ✅ **Check for service worker:** Look in DevTools > Application > Service Workers
5. ✅ **Check network tab:** See if old JavaScript files are being served from cache
6. ✅ **Check localStorage:** Run `localStorage.getItem('subscriptionData')` and `localStorage.getItem('userSubscription')` in console
7. ✅ **Check for multiple subscription records:** Run SQL query in Supabase to check for multiple records

---

## 🎯 CONCLUSION

**The code paths above show:**
- ✅ `loadBillingInfo()` is SAFE - only uses Supabase
- ⚠️ Other functions use localStorage fallbacks but don't create subscription objects
- ❌ No code found that creates subscription objects with `amount_paid = 3.52`

**Most likely cause:**
- 🔍 **Browser cache** serving old JavaScript/HTML
- 🔍 **Old subscription record in Supabase** (even though user says it's not there)

**Next steps:**
1. Add more aggressive cache-busting
2. Add version check to prevent old code from running
3. Add logging to detect if old code is running
4. Check Supabase for multiple subscription records

