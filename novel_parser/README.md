# 📖 Novel Parser: Easy Setup Guide

This tool automatically collects chapters from web novels, saves them to your computer, and turns them into EPUB books that you can read on your Kindle, phone, or e-reader.

---

## 🛠 Step 1: Install the "Engine" (Node.js)
To run this app, your computer needs a program called **Node.js**.

1. Go to [nodejs.org](https://nodejs.org/).
2. Click the button that says **"LTS"** (it is the most stable version).
3. Download the installer and run it. Click "Next" until it finishes.

---

## 📥 Step 2: Get the Novel Parser Files
1. Download this project as a ZIP file (click the green **Code** button on GitHub and select **Download ZIP**).
2. Unzip the folder to a place you can easily find it, like your **Desktop** or **Documents**.

---

## 🖥 Step 3: Setting it up (first time only)
You need to tell your computer to "prepare" the app.

### For Windows users:
1. Open the folder where you unzipped the files.
2. Click the address bar at the top of the folder window, type `cmd`, and press **Enter**.
3. Type the following command and press **Enter**:
   ```text
   npm install
   ```
4. Wait for it to finish (it might take a minute). You can close the window when it is done.

### For Mac users:
1. Open **Terminal** (press `Command + Space` and search for "Terminal").
2. Type `cd` followed by a space, then drag the **Novel Parser** folder into the Terminal window.
3. Press **Enter**.
4. Type the following command and press **Enter**:
   ```bash
   npm install
   ```

---

## 🚀 Step 4: How to run the app
Whenever you want to use the tool, follow these steps:

1. Open the folder again (Windows: type `cmd` in the address bar / Mac: open Terminal and `cd` into the folder).
2. Type this command and press **Enter**:
   ```bash
   npm run build && npm start
   ```
3. **Keep this window open.** The app is now running.
4. Open your web browser (Chrome, Edge, etc.) and go to:
   [http://localhost:3000](http://localhost:3000)

---

## 💡 Things to know
- **The "Magic" browser:** When the app starts collecting chapters, a Chrome window will pop up and start clicking through pages. **Do not close this window.**
- **Where are my books?** Finished EPUB files are saved in `public/epubs`.
- **Covers & fonts:** Downloaded covers and fonts are saved in `public/covers` and `public/fonts`.
- **The database:** All chapters are stored in `db/novels.sqlite`.

---

## ❓ Troubleshooting
- **"Command not found":** Restart your computer after installing Node.js.
- **The browser will not open (Linux users):** Linux needs extra system packages for Chrome. See the advanced Linux setup in the developer documentation.
- **It is stuck:** Press `Ctrl + C` in the black window to stop it, then run `npm run dev` again.
