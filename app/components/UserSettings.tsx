'use client';

import { useState, useEffect, type ChangeEvent } from 'react';
import { useUser } from '@clerk/nextjs';
import { optimizedStorage } from '@/app/lib/optimizedStorage';
import { userSettingsManager } from '@/app/lib/userSettings';
import {
  defaultAnkiSettings,
  normalizeSettings,
  parseSteps,
  type AnkiSettings,
} from '@/app/lib/srs/ankiScheduler';

interface UserSettingsProps {
  onClose: () => void;
}

export default function UserSettings({ onClose }: UserSettingsProps) {
  const { user } = useUser();
  const [dailyGoal, setDailyGoal] = useState(20);
  const [tempGoal, setTempGoal] = useState('20');
  const [saving, setSaving] = useState(false);
  const [srsSettings, setSrsSettings] = useState<AnkiSettings>({ ...defaultAnkiSettings });
  const [learningStepsInput, setLearningStepsInput] = useState(defaultAnkiSettings.learningSteps.join(','));
  const [relearningStepsInput, setRelearningStepsInput] = useState(defaultAnkiSettings.relearningSteps.join(','));
  const [srsSaving, setSrsSaving] = useState(false);

  useEffect(() => {
    if (user) {
      optimizedStorage.setUserId(user.id);
      const currentGoal = optimizedStorage.getDailyGoal();
      setDailyGoal(currentGoal);
      setTempGoal(currentGoal.toString());

      const currentSrs = userSettingsManager.getSrsSettings();
      setSrsSettings(currentSrs);
      setLearningStepsInput(currentSrs.learningSteps.join(','));
      setRelearningStepsInput(currentSrs.relearningSteps.join(','));
    }
  }, [user]);

  const handleSave = async () => {
    const newGoal = parseInt(tempGoal);

    if (isNaN(newGoal) || newGoal < 1 || newGoal > 100) {
      alert('请输入1-100之间的有效数字');
      return;
    }

    setSaving(true);
    try {
      optimizedStorage.setDailyGoal(newGoal);
      setDailyGoal(newGoal);
      alert('设置已保存！');
    } catch (error) {
      alert('保存失败，请重试');
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setTempGoal(dailyGoal.toString());
  };

  const updateSrsSetting = <K extends keyof AnkiSettings>(key: K, value: AnkiSettings[K]) => {
    setSrsSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSaveSrs = async () => {
    setSrsSaving(true);
    try {
      const parsedLearning = parseSteps(learningStepsInput);
      const parsedRelearning = parseSteps(relearningStepsInput);

      const payload: AnkiSettings = {
        ...srsSettings,
        learningSteps: parsedLearning.length > 0 ? parsedLearning : [...defaultAnkiSettings.learningSteps],
        relearningSteps: parsedRelearning.length > 0 ? parsedRelearning : [...defaultAnkiSettings.relearningSteps],
      };

      const normalized = normalizeSettings(payload);
      userSettingsManager.saveSrsSettings(normalized);
      setSrsSettings(normalized);
      setLearningStepsInput(normalized.learningSteps.join(','));
      setRelearningStepsInput(normalized.relearningSteps.join(','));
      alert('SRS 设置已保存！');
    } catch (error) {
      console.error('Failed to save SRS settings:', error);
      alert('SRS 设置保存失败，请重试');
    } finally {
      setSrsSaving(false);
    }
  };

  const handleResetSrs = () => {
    const defaults: AnkiSettings = { ...defaultAnkiSettings };
    userSettingsManager.saveSrsSettings(defaults);
    setSrsSettings(defaults);
    setLearningStepsInput(defaults.learningSteps.join(','));
    setRelearningStepsInput(defaults.relearningSteps.join(','));
  };

  const handleNumberSettingChange = (key: keyof AnkiSettings) => (event: ChangeEvent<HTMLInputElement>) => {
    const raw = Number(event.target.value);
    const value = Number.isFinite(raw) ? raw : srsSettings[key];
    updateSrsSetting(key, value as AnkiSettings[typeof key]);
  };

  const todayProgress = user ? optimizedStorage.getTodayProgress() : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50">
      {/* Header with gradient design similar to home page */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-400 via-yellow-400 to-orange-400 opacity-90"></div>
        <div className="absolute inset-0 opacity-30">
          <div className="w-full h-full bg-gradient-to-br from-transparent via-white/10 to-transparent"></div>
        </div>
        <div className="relative max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onClose}
                className="p-3 hover:bg-amber-100/50 rounded-xl transition-colors border border-amber-200/50 backdrop-blur-sm bg-amber-50/50"
              >
                <svg className="w-6 h-6 text-amber-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <div className="inline-flex items-center gap-2 mb-2 px-3 py-1 bg-amber-100/80 backdrop-blur-sm rounded-full border border-amber-200/50 shadow-md">
                  <span className="text-xl">⚙️</span>
                  <span className="text-sm font-medium text-amber-800">用户设置</span>
                </div>
                <h1 className="text-2xl md:text-3xl font-bold text-amber-900 drop-shadow-sm">个人偏好设置</h1>
                <p className="text-amber-700 text-sm md:text-base">自定义你的学习体验和目标</p>
              </div>
            </div>
            <div className="text-right">
              <div className="bg-amber-100/80 backdrop-blur-sm rounded-lg p-3 border border-amber-200/50 shadow-md">
                <p className="text-xs text-amber-700">当前用户</p>
                <p className="font-medium text-amber-900">{user?.firstName || user?.emailAddresses[0]?.emailAddress}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Daily Goal Settings */}
        <div className="bg-blue-200 rounded-xl shadow-xl border-l-6 border-blue-400 p-8 mb-8 rotate-1 hover:rotate-0 transition-all duration-500">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xl">🎯</span>
            </div>
            <h2 className="text-2xl font-bold text-blue-900">学习目标设置</h2>
          </div>

          {todayProgress && (
            <div className="mb-6 p-6 bg-blue-100/70 rounded-xl">
              <h3 className="font-bold text-blue-900 mb-4 flex items-center gap-2">
                <span className="text-xl">📊</span>
                今日进度
              </h3>
              <div className="flex items-center justify-between mb-3">
                <span className="text-blue-800 font-medium">已学习</span>
                <span className="font-bold text-blue-600 text-lg">
                  {todayProgress.studied} / {todayProgress.goal} 张
                </span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-3">
                <div
                  className="bg-green-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${todayProgress.percentage}%` }}
                ></div>
              </div>
              <div className="text-sm text-blue-700 mt-2 text-center font-medium">
                {todayProgress.percentage.toFixed(1)}% 完成
                {todayProgress.completed && ' 🎉 今日目标已达成！'}
              </div>
            </div>
          )}

          <div className="space-y-6">
            <div>
              <label htmlFor="dailyGoal" className="block text-lg font-bold text-blue-900 mb-3">
                每日学习目标 (卡片数量)
              </label>
              <div className="flex items-center space-x-4">
                <input
                  type="number"
                  id="dailyGoal"
                  min="1"
                  max="100"
                  value={tempGoal}
                  onChange={(e) => setTempGoal(e.target.value)}
                  className="flex-1 px-4 py-3 border-2 border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-blue-50 text-blue-900 font-medium"
                  placeholder="输入每日目标卡片数量"
                />
                <span className="text-blue-700 font-medium">张/天</span>
              </div>
              <p className="text-sm text-blue-700 mt-2 font-medium">
                💡 建议设置为10-50张，根据您的学习时间调整
              </p>
            </div>

            <div className="flex space-x-4">
              <button
                onClick={handleSave}
                disabled={saving || tempGoal === dailyGoal.toString()}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold shadow-lg"
              >
                {saving ? '保存中...' : '💾 保存设置'}
              </button>
              <button
                onClick={handleReset}
                disabled={tempGoal === dailyGoal.toString()}
                className="px-6 py-3 bg-blue-300 text-blue-900 rounded-lg hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold"
              >
                🔄 重置
              </button>
            </div>
          </div>
        </div>

        {/* Goal Suggestions */}
        <div className="bg-green-200 rounded-xl shadow-xl border-l-6 border-green-400 p-8 mb-8 -rotate-1 hover:rotate-0 transition-all duration-500">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xl">💡</span>
            </div>
            <h3 className="text-2xl font-bold text-green-900">推荐目标</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <button
              onClick={() => setTempGoal('10')}
              className="group bg-green-100 rounded-xl p-6 border-2 border-green-300 hover:border-green-500 hover:bg-green-50 transition-all duration-300 text-left hover:scale-105 rotate-1 hover:rotate-0"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">🐢</span>
                <div className="font-bold text-green-900 text-lg">轻松模式</div>
              </div>
              <div className="text-green-600 text-3xl font-bold mb-2">10 张/天</div>
              <div className="text-sm text-green-700 font-medium">适合初学者或时间较少的学习者</div>
            </button>

            <button
              onClick={() => setTempGoal('20')}
              className="group bg-green-100 rounded-xl p-6 border-2 border-green-300 hover:border-green-500 hover:bg-green-50 transition-all duration-300 text-left hover:scale-105 -rotate-1 hover:rotate-0"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">⚡</span>
                <div className="font-bold text-green-900 text-lg">标准模式</div>
              </div>
              <div className="text-green-600 text-3xl font-bold mb-2">20 张/天</div>
              <div className="text-sm text-green-700 font-medium">平衡学习强度和效果</div>
            </button>

            <button
              onClick={() => setTempGoal('40')}
              className="group bg-green-100 rounded-xl p-6 border-2 border-green-300 hover:border-green-500 hover:bg-green-50 transition-all duration-300 text-left hover:scale-105 rotate-2 hover:rotate-0"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">🚀</span>
                <div className="font-bold text-green-900 text-lg">挑战模式</div>
              </div>
              <div className="text-green-600 text-3xl font-bold mb-2">40 张/天</div>
              <div className="text-sm text-green-700 font-medium">快速提升，适合考试冲刺</div>
            </button>
          </div>
        </div>

        {/* SRS Settings */}
        <div className="bg-indigo-200 rounded-xl shadow-xl border-l-6 border-indigo-400 p-8 mb-8 rotate-2 hover:rotate-0 transition-all duration-500">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-indigo-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xl">🧠</span>
            </div>
            <h3 className="text-2xl font-bold text-indigo-900">间隔重复设置</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-semibold text-indigo-900 mb-2">学习步长 (分钟)</label>
              <input
                type="text"
                value={learningStepsInput}
                onChange={(e) => setLearningStepsInput(e.target.value)}
                className="w-full px-4 py-2 border-2 border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-indigo-50 text-indigo-900"
                placeholder="例如：1,10"
              />
              <p className="text-xs text-indigo-700 mt-1">逗号分隔的分钟值，将依次安排学习步长</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-indigo-900 mb-2">重学步长 (分钟)</label>
              <input
                type="text"
                value={relearningStepsInput}
                onChange={(e) => setRelearningStepsInput(e.target.value)}
                className="w-full px-4 py-2 border-2 border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-indigo-50 text-indigo-900"
                placeholder="例如：10"
              />
              <p className="text-xs text-indigo-700 mt-1">复习失败后重新学习的时间步长</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-semibold text-indigo-900 mb-2">毕业间隔 (天)</label>
              <input
                type="number"
                min={1}
                value={srsSettings.graduatingInterval}
                onChange={handleNumberSettingChange('graduatingInterval')}
                className="w-full px-4 py-2 border-2 border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-indigo-50 text-indigo-900"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-indigo-900 mb-2">简单卡片间隔 (天)</label>
              <input
                type="number"
                min={1}
                value={srsSettings.easyInterval}
                onChange={handleNumberSettingChange('easyInterval')}
                className="w-full px-4 py-2 border-2 border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-indigo-50 text-indigo-900"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-indigo-900 mb-2">每日新卡上限</label>
              <input
                type="number"
                min={0}
                value={srsSettings.newCardsPerDay}
                onChange={handleNumberSettingChange('newCardsPerDay')}
                className="w-full px-4 py-2 border-2 border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-indigo-50 text-indigo-900"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-indigo-900 mb-2">每日复习上限</label>
              <input
                type="number"
                min={0}
                value={srsSettings.reviewLimitPerDay}
                onChange={handleNumberSettingChange('reviewLimitPerDay')}
                className="w-full px-4 py-2 border-2 border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-indigo-50 text-indigo-900"
              />
              <p className="text-xs text-indigo-700 mt-1">设置为 0 表示不限制</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-indigo-900 mb-2">简单奖励系数</label>
              <input
                type="number"
                step="0.05"
                min={1}
                value={srsSettings.easyBonus}
                onChange={handleNumberSettingChange('easyBonus')}
                className="w-full px-4 py-2 border-2 border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-indigo-50 text-indigo-900"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-indigo-900 mb-2">间隔调整系数</label>
              <input
                type="number"
                step="0.05"
                min={0.1}
                value={srsSettings.intervalModifier}
                onChange={handleNumberSettingChange('intervalModifier')}
                className="w-full px-4 py-2 border-2 border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-indigo-50 text-indigo-900"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-indigo-900 mb-2">困难倍率</label>
              <input
                type="number"
                step="0.05"
                min={1}
                value={srsSettings.hardMultiplier}
                onChange={handleNumberSettingChange('hardMultiplier')}
                className="w-full px-4 py-2 border-2 border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-indigo-50 text-indigo-900"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-indigo-900 mb-2">遗忘倍率</label>
              <input
                type="number"
                step="0.05"
                min={0}
                max={1}
                value={srsSettings.lapseMultiplier}
                onChange={handleNumberSettingChange('lapseMultiplier')}
                className="w-full px-4 py-2 border-2 border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-indigo-50 text-indigo-900"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-indigo-900 mb-2">困难步长倍率</label>
              <input
                type="number"
                step="0.1"
                min={1}
                value={srsSettings.learningHardIntervalMultiplier}
                onChange={handleNumberSettingChange('learningHardIntervalMultiplier')}
                className="w-full px-4 py-2 border-2 border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-indigo-50 text-indigo-900"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-indigo-900 mb-2">起始易度</label>
              <input
                type="number"
                step="0.05"
                min={1.3}
                value={srsSettings.startingEase}
                onChange={handleNumberSettingChange('startingEase')}
                className="w-full px-4 py-2 border-2 border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-indigo-50 text-indigo-900"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-indigo-900 mb-2">最小间隔 (天)</label>
              <input
                type="number"
                min={0.1}
                step="0.1"
                value={srsSettings.minimumInterval}
                onChange={handleNumberSettingChange('minimumInterval')}
                className="w-full px-4 py-2 border-2 border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-indigo-50 text-indigo-900"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-indigo-900 mb-2">最大间隔 (天)</label>
              <input
                type="number"
                min={1}
                value={srsSettings.maximumInterval}
                onChange={handleNumberSettingChange('maximumInterval')}
                className="w-full px-4 py-2 border-2 border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-indigo-50 text-indigo-900"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-indigo-900 mb-2">漏网卡阈值</label>
              <input
                type="number"
                min={1}
                value={srsSettings.leechThreshold}
                onChange={handleNumberSettingChange('leechThreshold')}
                className="w-full px-4 py-2 border-2 border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-indigo-50 text-indigo-900"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-indigo-900 mb-2">漏网卡处理</label>
              <select
                value={srsSettings.leechAction}
                onChange={(e) => updateSrsSetting('leechAction', e.target.value as AnkiSettings['leechAction'])}
                className="w-full px-4 py-2 border-2 border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-indigo-50 text-indigo-900"
              >
                <option value="none">不处理</option>
                <option value="tag">添加标签</option>
                <option value="suspend">暂停卡片</option>
              </select>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-4">
            <button
              onClick={handleSaveSrs}
              disabled={srsSaving}
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold shadow-lg"
            >
              {srsSaving ? '保存中...' : '💾 保存 SRS 设置'}
            </button>
            <button
              onClick={handleResetSrs}
              className="px-6 py-3 bg-indigo-300 text-indigo-900 rounded-lg hover:bg-indigo-400 transition-colors font-bold"
            >
              🔄 恢复默认值
            </button>
          </div>
        </div>

        {/* Statistics */}
        {todayProgress && (
          <div className="bg-purple-200 rounded-xl shadow-xl border-l-6 border-purple-400 p-8 rotate-2 hover:rotate-0 transition-all duration-500">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xl">📈</span>
              </div>
              <h3 className="text-2xl font-bold text-purple-900">学习统计</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center bg-purple-100/70 rounded-xl p-4 rotate-1 hover:rotate-0 transition-all duration-300">
                <div className="text-3xl font-bold text-green-600 mb-1">{todayProgress.studied}</div>
                <div className="text-sm text-purple-800 font-medium">今日已学</div>
              </div>
              <div className="text-center bg-purple-100/70 rounded-xl p-4 -rotate-1 hover:rotate-0 transition-all duration-300">
                <div className="text-3xl font-bold text-blue-600 mb-1">{todayProgress.remaining}</div>
                <div className="text-sm text-purple-800 font-medium">剩余目标</div>
              </div>
              <div className="text-center bg-purple-100/70 rounded-xl p-4 rotate-2 hover:rotate-0 transition-all duration-300">
                <div className="text-3xl font-bold text-purple-600 mb-1">{todayProgress.percentage.toFixed(0)}%</div>
                <div className="text-sm text-purple-800 font-medium">完成进度</div>
              </div>
              <div className="text-center bg-purple-100/70 rounded-xl p-4 -rotate-2 hover:rotate-0 transition-all duration-300">
                <div className="text-3xl font-bold text-orange-600 mb-1">{todayProgress.goal}</div>
                <div className="text-sm text-purple-800 font-medium">当前目标</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
