'use client';

import { SignInButton } from '@clerk/nextjs';

interface LoginPromptProps {
  isOpen: boolean;
  onClose: () => void;
  onContinueWithoutSaving?: () => void;
  allowGuestContinue?: boolean;
  title?: string;
  description?: string;
  icon?: string;
  benefits?: string[];
  continueLabel?: string;
  cancelLabel?: string;
}

export default function LoginPrompt({
  isOpen,
  onClose,
  onContinueWithoutSaving,
  allowGuestContinue = true,
  title = '要保存学习进度吗？',
  description = '登录账号即可在多设备之间同步保存学习进度，保留复习节奏与统计数据。',
  icon = '💾',
  benefits = [
    '跨设备自动同步学习进度',
    '查看完整学习统计',
    '个性化学习建议',
    '学习数据云端备份',
  ],
  continueLabel = '暂不登录，继续体验',
  cancelLabel = '稍后提醒我',
}: LoginPromptProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl">
        <div className="text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">{icon}</span>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-4">{title}</h2>

          <p className="text-gray-600 mb-6 leading-relaxed">
            {description}
          </p>

          <div className="space-y-3">
            <SignInButton mode="modal">
              <button className="w-full px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg transition-colors shadow-md">
                登录以保存进度
              </button>
            </SignInButton>

            {allowGuestContinue && onContinueWithoutSaving && (
              <button
                onClick={onContinueWithoutSaving}
                className="w-full px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
              >
                {continueLabel}
              </button>
            )}

            <button
              onClick={onClose}
              className="w-full px-6 py-3 text-gray-500 hover:text-gray-700 font-medium transition-colors"
            >
              {cancelLabel}
            </button>
          </div>

          {benefits.length > 0 && (
            <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-start gap-3">
                <span className="text-blue-600 text-lg">ℹ️</span>
                <div className="text-left">
                  <p className="text-sm text-blue-800 font-medium mb-1">登录的好处：</p>
                  <ul className="text-xs text-blue-700 space-y-1">
                    {benefits.map((benefit) => (
                      <li key={benefit}>• {benefit}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
