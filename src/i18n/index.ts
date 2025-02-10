// i18n

import i18next from "i18next";

import zh_cn from "../../languages/zh_CN.json";
import en_us from "../../languages/en_US.json";

import { config } from '../lib/d';

i18next.init({
  interpolation: {
    escapeValue: false
  },
  lng: config.Language || "zh_cn",
  fallbackLng: "en_us",
  resources: {
    en_us: {
      translation: en_us
    },
    zh_cn: {
      translation: zh_cn
    }
  }
});

// alias
const $t = i18next.t;

export { $t, i18next };