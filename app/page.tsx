"use client";

import { useState } from "react";
import Image from 'next/image';
import { useUser, SignInButton, SignOutButton } from '@clerk/nextjs'
import StudySession from "./components/StudySession";
import StatsDisplay from "./components/StatsDisplay";
import GrammarQuery from "./components/GrammarQuery";
import SyncStatus from "./components/SyncStatus";
import UserSettings from "./components/UserSettings";

export default function Home() {
  const { user, isLoaded } = useUser()
  const [currentView, setCurrentView] = useState<
    "menu" | "study" | "review" | "browse" | "stats" | "query" | "settings"
  >("menu");

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4"></div>
          <p className="text-amber-700">Loading...</p>
        </div>
      </div>
    )
  }

  const menuItems = [
    {
      id: "study",
      title: "📚 学习模式",
      description: "通过间隔重复学习新的语法规则",
      color: "bg-blue-600 hover:bg-blue-700",
    },
    {
      id: "review",
      title: "🔄 复习模式",
      description: "复习之前学过的卡片",
      color: "bg-green-600 hover:bg-green-700",
    },
    {
      id: "browse",
      title: "📖 浏览模式",
      description: "通过搜索和筛选浏览所有语法规则",
      color: "bg-purple-600 hover:bg-purple-700",
    },
    {
      id: "query",
      title: "🔍 语法查询",
      description: "搜索和查看所有语法规则详情",
      color: "bg-indigo-600 hover:bg-indigo-700",
    },
    {
      id: "stats",
      title: "📊 统计数据",
      description: "查看你的学习进度和表现",
      color: "bg-orange-600 hover:bg-orange-700",
    },
    {
      id: "settings",
      title: "⚙️ 设置",
      description: "自定义学习目标和偏好设置",
      color: "bg-gray-600 hover:bg-gray-700",
    },
  ];

  if (currentView === "stats") {
    return <StatsDisplay onClose={() => setCurrentView("menu")} />;
  }

  if (currentView === "query") {
    return <GrammarQuery onBack={() => setCurrentView("menu")} />;
  }

  if (currentView === "settings") {
    return <UserSettings onClose={() => setCurrentView("menu")} />;
  }

  if (currentView !== "menu") {
    return (
      <StudySession
        mode={currentView as "study" | "review" | "browse"}
        onBack={() => setCurrentView("menu")}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50">
      {/* Header - Compact */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-400 via-yellow-400 to-orange-400 opacity-90"></div>
        <div className="absolute inset-0 opacity-30">
          <div className="w-full h-full bg-gradient-to-br from-transparent via-white/10 to-transparent"></div>
        </div>
        <div className="relative max-w-6xl mx-auto px-6 py-8">
          {/* User Profile/Auth Section */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              {user?.imageUrl && (
                <Image
                  src={user.imageUrl}
                  alt="Profile"
                  width={40}
                  height={40}
                  className="w-10 h-10 rounded-full border-2 border-amber-200"
                />
              )}
              <div>
                {user ? (
                  <>
                    <p className="text-amber-900 font-medium">
                      Welcome back, {user?.firstName || user?.emailAddresses[0]?.emailAddress}!
                    </p>
                    <p className="text-amber-700 text-sm">Your progress is being saved</p>
                  </>
                ) : (
                  <>
                    <p className="text-amber-900 font-medium">Welcome to Japanese Grammar N2</p>
                    <p className="text-amber-700 text-sm">Sign in to save your progress</p>
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {user ? (
                <SignOutButton>
                  <button className="px-4 py-2 bg-amber-100/80 hover:bg-amber-200/80 text-amber-900 rounded-lg border border-amber-200 transition-colors">
                    Sign Out
                  </button>
                </SignOutButton>
              ) : (
                <SignInButton mode="modal">
                  <button className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors shadow-md">
                    Sign In to Save Progress
                  </button>
                </SignInButton>
              )}
            </div>
          </div>

          <div className="text-center">
            <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 bg-amber-100/80 backdrop-blur-sm rounded-full border border-amber-200/50 shadow-md">
              <span className="text-xl">🎌</span>
              <span className="text-sm font-medium text-amber-800">
                JLPT N2 语法学习
              </span>
            </div>

            <h1 className="text-2xl md:text-3xl font-bold mb-2 text-amber-900 drop-shadow-sm">
              日语语法 N2
            </h1>

            <p className="text-sm md:text-base text-amber-700 max-w-lg mx-auto leading-relaxed">
              通过智能间隔重复算法和精美交互设计，让日语N2语法学习变得高效而愉悦
            </p>
          </div>
        </div>
      </div>

      {/* Study Mode Selection - Main Focus */}
      <div className="max-w-6xl mx-auto px-6 py-24">
        {/* Sync Status Display */}
        {user && (
          <div className="mb-8">
            <SyncStatus />
          </div>
        )}

        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-amber-900 mb-6">
            选择学习模式
          </h2>
          <p className="text-xl text-amber-700 max-w-3xl mx-auto leading-relaxed">
            根据你的学习目标，选择最适合的学习方式开始你的日语语法之旅
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {menuItems.map((item, index) => {
            const stickyColors = [
              {
                bg: "bg-yellow-200",
                border: "border-yellow-300",
                text: "text-yellow-900",
                hover: "hover:bg-yellow-300",
              },
              {
                bg: "bg-green-200",
                border: "border-green-300",
                text: "text-green-900",
                hover: "hover:bg-green-300",
              },
              {
                bg: "bg-blue-200",
                border: "border-blue-300",
                text: "text-blue-900",
                hover: "hover:bg-blue-300",
              },
              {
                bg: "bg-pink-200",
                border: "border-pink-300",
                text: "text-pink-900",
                hover: "hover:bg-pink-300",
              },
              {
                bg: "bg-orange-200",
                border: "border-orange-300",
                text: "text-orange-900",
                hover: "hover:bg-orange-300",
              },
            ];
            const colorScheme = stickyColors[index % stickyColors.length];
            const rotations = [
              "rotate-1",
              "rotate-2",
              "-rotate-1",
              "rotate-3",
              "-rotate-2",
              "rotate-1",
            ];
            const rotation = rotations[index % rotations.length];

            return (
              <button
                key={item.id}
                onClick={() =>
                  setCurrentView(
                    item.id as "study" | "review" | "browse" | "stats" | "query" | "settings"
                  )
                }
                className={`group relative ${colorScheme.bg} ${colorScheme.hover} rounded-xl p-10 border-l-6 ${colorScheme.border} shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-110 overflow-hidden text-left ${rotation}`}
                style={{
                  animationDelay: `${index * 150}ms`,
                }}
              >
                {/* Icon */}
                <div className="relative mb-8">
                  <div className="text-5xl mb-6 transform group-hover:scale-125 transition-transform duration-300">
                    {item.title.split(" ")[0]}
                  </div>

                  {/* Title */}
                  <h3
                    className={`text-3xl font-bold ${colorScheme.text} mb-4 transition-colors duration-300`}
                  >
                    {item.title.split(" ").slice(1).join(" ")}
                  </h3>

                  {/* Description */}
                  <p
                    className={`${colorScheme.text} opacity-80 transition-colors duration-300 leading-relaxed text-lg`}
                  >
                    {item.description}
                  </p>
                </div>

                {/* Arrow icon */}
                <div className="relative flex items-center justify-between">
                  <div
                    className={`flex items-center text-lg ${colorScheme.text} opacity-70 transition-colors duration-300 font-medium`}
                  >
                    <span>立即开始</span>
                  </div>
                  <div
                    className={`w-10 h-10 rounded-full bg-white/50 flex items-center justify-center transform group-hover:translate-x-2 transition-all duration-300`}
                  >
                    <svg
                      className={`w-5 h-5 ${colorScheme.text}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats Section - Smaller */}
      <div className="max-w-6xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="group bg-yellow-200 rounded-lg p-4 shadow-md border-l-4 border-yellow-400 hover:shadow-lg transition-all duration-300 text-center rotate-1 hover:rotate-0">
            <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center mb-2 mx-auto">
              <span className="text-white text-sm">📚</span>
            </div>
            <div className="text-2xl font-bold text-yellow-800 mb-1">531</div>
            <div className="text-yellow-700 text-xs font-medium">语法卡片</div>
          </div>
          <div className="group bg-green-200 rounded-lg p-4 shadow-md border-l-4 border-green-400 hover:shadow-lg transition-all duration-300 text-center -rotate-1 hover:rotate-0">
            <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center mb-2 mx-auto">
              <span className="text-white text-sm">⚡</span>
            </div>
            <div className="text-2xl font-bold text-green-800 mb-1">138</div>
            <div className="text-green-700 text-xs font-medium">语法规则</div>
          </div>
          <div className="group bg-pink-200 rounded-lg p-4 shadow-md border-l-4 border-pink-400 hover:shadow-lg transition-all duration-300 text-center rotate-2 hover:rotate-0">
            <div className="w-8 h-8 bg-pink-500 rounded-full flex items-center justify-center mb-2 mx-auto">
              <span className="text-white text-sm">🎯</span>
            </div>
            <div className="text-2xl font-bold text-pink-800 mb-1">148</div>
            <div className="text-pink-700 text-xs font-medium">课程</div>
          </div>
          <div className="group bg-orange-200 rounded-lg p-4 shadow-md border-l-4 border-orange-400 hover:shadow-lg transition-all duration-300 text-center -rotate-2 hover:rotate-0">
            <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center mb-2 mx-auto">
              <span className="text-white text-sm">🏆</span>
            </div>
            <div className="text-2xl font-bold text-orange-800 mb-1">N2</div>
            <div className="text-orange-700 text-xs font-medium">JLPT等级</div>
          </div>
        </div>
      </div>

      {/* Features Section - Compact */}
      <div className="max-w-6xl mx-auto px-6 pb-12">
        <div className="text-center mb-8">
          <h3 className="text-2xl font-bold text-amber-900 mb-3">
            ✨ 主要功能
          </h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="bg-lime-200 rounded-lg p-4 border-l-4 border-lime-400 transition-all duration-300 rotate-1 hover:rotate-0">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-lime-500 rounded-full flex items-center justify-center">
                <span className="text-white text-sm">⚡</span>
              </div>
              <div>
                <div className="text-base font-bold text-lime-900">
                  间隔重复
                </div>
              </div>
            </div>
          </div>

          <div className="bg-sky-200 rounded-lg p-4 border-l-4 border-sky-400 transition-all duration-300 -rotate-1 hover:rotate-0">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-sky-500 rounded-full flex items-center justify-center">
                <span className="text-white text-sm">🎨</span>
              </div>
              <div>
                <div className="text-base font-bold text-sky-900">丰富格式</div>
              </div>
            </div>
          </div>

          <div className="bg-purple-200 rounded-lg p-4 border-l-4 border-purple-400 transition-all duration-300 rotate-2 hover:rotate-0">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                <span className="text-white text-sm">🔊</span>
              </div>
              <div>
                <div className="text-base font-bold text-purple-900">
                  音频支持
                </div>
              </div>
            </div>
          </div>

          <div className="bg-red-200 rounded-lg p-4 border-l-4 border-red-400 transition-all duration-300 -rotate-2 hover:rotate-0">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                <span className="text-white text-sm">⌨️</span>
              </div>
              <div>
                <div className="text-base font-bold text-red-900">快捷键</div>
              </div>
            </div>
          </div>

          <div className="bg-teal-200 rounded-lg p-4 border-l-4 border-teal-400 transition-all duration-300 rotate-1 hover:rotate-0">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-teal-500 rounded-full flex items-center justify-center">
                <span className="text-white text-sm">📊</span>
              </div>
              <div>
                <div className="text-base font-bold text-teal-900">
                  进度跟踪
                </div>
              </div>
            </div>
          </div>

          <div className="bg-rose-200 rounded-lg p-4 border-l-4 border-rose-400 transition-all duration-300 -rotate-1 hover:rotate-0">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-rose-500 rounded-full flex items-center justify-center">
                <span className="text-white text-sm">📱</span>
              </div>
              <div>
                <div className="text-base font-bold text-rose-900">
                  移动适配
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts - Compact */}
      <div className="max-w-6xl mx-auto px-6 pb-16">
        <div className="bg-amber-800 rounded-2xl p-6 shadow-lg">
          <div className="text-center mb-6">
            <h3 className="text-xl font-bold text-amber-100 mb-2">⌨️ 快捷键</h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-yellow-200 rounded-lg p-3 border-l-4 border-yellow-400 text-center rotate-1 hover:rotate-0 transition-all duration-300">
              <kbd className="inline-flex items-center px-3 py-1 bg-yellow-400 text-yellow-900 font-mono text-sm rounded border border-yellow-500">
                Space
              </kbd>
              <div className="text-yellow-900 font-medium text-xs mt-1">
                显示答案
              </div>
            </div>

            <div className="bg-green-200 rounded-lg p-3 border-l-4 border-green-400 text-center -rotate-1 hover:rotate-0 transition-all duration-300">
              <kbd className="inline-flex items-center px-3 py-1 bg-green-400 text-green-900 font-mono text-sm rounded border border-green-500">
                ← →
              </kbd>
              <div className="text-green-900 font-medium text-xs mt-1">
                切换卡片
              </div>
            </div>

            <div className="bg-blue-200 rounded-lg p-3 border-l-4 border-blue-400 text-center rotate-2 hover:rotate-0 transition-all duration-300">
              <kbd className="inline-flex items-center px-3 py-1 bg-blue-400 text-blue-900 font-mono text-sm rounded border border-blue-500">
                0-3
              </kbd>
              <div className="text-blue-900 font-medium text-xs mt-1">评分</div>
            </div>

            <div className="bg-pink-200 rounded-lg p-3 border-l-4 border-pink-400 text-center -rotate-2 hover:rotate-0 transition-all duration-300">
              <kbd className="inline-flex items-center px-3 py-1 bg-pink-400 text-pink-900 font-mono text-sm rounded border border-pink-500">
                Esc
              </kbd>
              <div className="text-pink-900 font-medium text-xs mt-1">返回</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
