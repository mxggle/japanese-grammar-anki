'use client';

import { SignInButton } from '@clerk/nextjs';

interface LoginPromptProps {
  isOpen: boolean;
  onClose: () => void;
  onContinueWithoutSaving: () => void;
}

export default function LoginPrompt({ isOpen, onClose, onContinueWithoutSaving }: LoginPromptProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl">
        <div className="text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">💾</span>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-4">Save Your Progress?</h2>

          <p className="text-gray-600 mb-6 leading-relaxed">
            Sign in to save your learning progress and access it from any device.
            Your study statistics and spaced repetition schedule will be preserved.
          </p>

          <div className="space-y-3">
            <SignInButton mode="modal">
              <button className="w-full px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg transition-colors shadow-md">
                Sign In to Save Progress
              </button>
            </SignInButton>

            <button
              onClick={onContinueWithoutSaving}
              className="w-full px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
            >
              Continue Without Saving
            </button>

            <button
              onClick={onClose}
              className="w-full px-6 py-3 text-gray-500 hover:text-gray-700 font-medium transition-colors"
            >
              Cancel
            </button>
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-start gap-3">
              <span className="text-blue-600 text-lg">ℹ️</span>
              <div className="text-left">
                <p className="text-sm text-blue-800 font-medium mb-1">Benefits of signing in:</p>
                <ul className="text-xs text-blue-700 space-y-1">
                  <li>• Sync progress across devices</li>
                  <li>• Detailed learning statistics</li>
                  <li>• Personalized study recommendations</li>
                  <li>• Backup your study data</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
