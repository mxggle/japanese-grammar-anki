import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Only protect API routes that save data
const isProtectedRoute = createRouteMatcher([
  "/api/progress(.*)",
  "/api/stats(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
