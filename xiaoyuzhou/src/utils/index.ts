/*
 * @Author: YangLiwei 1280426581@qq.com
 * @Date: 2025-06-20 11:08:45
 * @LastEditTime: 2026-08-06 09:55:00
 * @LastEditors: YangLiwei 1280426581@qq.com
 * @FilePath: \touchfish\xiaoyuzhou\src\utils\index.ts
 * Copyright (c) 2025 by YangLiwei, All Rights Reserved.
 * @Description:
 */

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const openNewWindow = (url: string) => {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

export const debounce = (func: (...args: any[]) => void, delay: number) => {
  let timeout: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), delay);
  };
};
