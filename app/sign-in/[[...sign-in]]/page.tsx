import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 bg-amber-100 rounded-xl p-6 shadow-lg border-l-6 border-amber-400 rotate-1 hover:rotate-0 transition-all duration-500">
          <h1 className="text-3xl font-bold text-amber-900 mb-2">Welcome Back</h1>
          <p className="text-amber-700">Sign in to continue your Japanese grammar studies</p>
        </div>
        <div className="bg-white rounded-xl shadow-xl p-6 -rotate-1 hover:rotate-0 transition-all duration-500">
          <SignIn />
        </div>
      </div>
    </div>
  )
}