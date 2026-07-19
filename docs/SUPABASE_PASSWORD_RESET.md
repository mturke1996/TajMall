# ---- App ----
NEXT_PUBLIC_APP_URL="https://taj-mall-nu.vercel.app"
# Supabase → Authentication → URL Configuration:
#   Site URL: https://taj-mall-nu.vercel.app
#   Redirect URLs (أضف الكل):
#     https://taj-mall-nu.vercel.app/auth/confirm
#     https://taj-mall-nu.vercel.app/auth/callback
#     https://taj-mall-nu.vercel.app/login/reset-password
#     http://localhost:3000/auth/confirm
#
# Supabase → Authentication → Email Templates → Reset password
# استبدل رابط {{ .ConfirmationURL }} بهذا (يعمل من أي جهاز بدون PKCE):
#   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/login/reset-password
