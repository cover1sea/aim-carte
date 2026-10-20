import { defineConfig } from 'vite';

// GitHub Pages などサブパス (https://<ユーザー>.github.io/<リポジトリ>/) に置いても動くよう、相対パスで出力する
export default defineConfig({
  base: './',
});
