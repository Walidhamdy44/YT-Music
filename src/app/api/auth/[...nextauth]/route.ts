import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

// Session duration: 1 year in seconds
const ONE_YEAR = 365 * 24 * 60 * 60;

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/youtube",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
      }
      
      // Check if access token needs refresh
      const now = Math.floor(Date.now() / 1000);
      if (token.expiresAt && typeof token.expiresAt === 'number' && now > token.expiresAt - 300) {
        // Token expired or expiring in 5 minutes, try to refresh
        if (token.refreshToken) {
          try {
            const response = await fetch("https://oauth2.googleapis.com/token", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID || "",
                client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
                grant_type: "refresh_token",
                refresh_token: token.refreshToken as string,
              }),
            });

            const tokens = await response.json();

            if (tokens.access_token) {
              token.accessToken = tokens.access_token;
              token.expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;
              // Keep the same refresh token unless a new one is provided
              if (tokens.refresh_token) {
                token.refreshToken = tokens.refresh_token;
              }
            }
          } catch (error) {
            console.error("Failed to refresh access token:", error);
          }
        }
      }
      
      return token;
    },
    async session({ session, token }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (session as any).accessToken = token.accessToken;
      if (session.user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).id = token.sub;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: ONE_YEAR, // Session lasts 1 year
  },
  // JWT also lasts 1 year
  jwt: {
    maxAge: ONE_YEAR,
  },
});

export { handler as GET, handler as POST };
