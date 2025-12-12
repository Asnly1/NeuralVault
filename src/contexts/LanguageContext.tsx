import React, { createContext, useContext, useState, useEffect } from "react";
import { translations, Language } from "@/translations";

type TranslationKeys = typeof translations.zh;

// 辅助类型：获取嵌套对象的键路径
// 这里简化处理，可以根据需求扩充类型定义来支持深层嵌套的类型安全
// 目前我们手动定义 t 函数的返回类型为 string

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (category: keyof TranslationKeys, key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // 默认从 localStorage 读取，如果没有则默认为英语 'en'
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem("language");
    return (saved === "zh" || saved === "en") ? saved : "en";
  });

  useEffect(() => {
    localStorage.setItem("language", language);
  }, [language]);

  const t = (category: keyof TranslationKeys, key: string): string => {
    const categoryObj = translations[language][category] as Record<string, string>;
    return categoryObj[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
