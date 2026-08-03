(function () {
  "use strict";
  const data = window.MWIT_DATA;
  const $ = (selector) => document.querySelector(selector);
  const screens = [...document.querySelectorAll(".screen")];
  const state = {
    current: "welcome", history: [], soundOn: true, idleTimer: null, recognition: null, listening: false,
    expressionIndex: 0, expressionTimer: null
  };
  const expressions = ["open-awake", "open-happy", "curve-awake", "curve-happy"];
  const els = {
    app: $("#app"), menuGrid: $("#menuGrid"), detailTitle: $("#detailTitle"), detailContent: $("#detailContent"),
    questionForm: $("#questionForm"), questionInput: $("#questionInput"), answerText: $("#answerText"), suggestionList: $("#suggestionList"),
    statusChip: $("#statusChip"), statusText: $("#statusText"), soundButton: $("#soundButton"), stopButton: $("#stopButton"),
    backButton: $("#backButton"), micButton: $("#micButton"), micNote: $("#micNote"), robotFace: $("#robotFace"),
    alvisMascot: $("#alvisMascot"), conversationText: $("#welcomeTitle"), conversationHint: $("#conversationHint"), startButton: $("#startButton")
  };

  function setExpression(name) {
    expressions.forEach((expression) => els.robotFace.classList.remove(`expression-${expression}`));
    els.robotFace.classList.add(`expression-${name}`);
  }

  function startExpressionCycle() {
    clearInterval(state.expressionTimer);
    setExpression(expressions[state.expressionIndex]);
    state.expressionTimer = setInterval(() => {
      if (state.current !== "welcome" || state.listening || els.robotFace.classList.contains("speaking-robot")) return;
      state.expressionIndex = (state.expressionIndex + 1) % expressions.length;
      setExpression(expressions[state.expressionIndex]);
    }, 4200);
  }

  function setStatus(kind) {
    const labels = { ready: "พร้อมใช้งาน", listening: "กำลังฟัง", speaking: "กำลังพูด" };
    els.statusChip.className = `status-chip ${kind === "ready" ? "" : kind}`;
    els.statusText.textContent = labels[kind] || labels.ready;
    els.robotFace.classList.toggle("speaking-robot", kind === "speaking");
    if (kind === "speaking") setExpression("open-happy");
    else if (kind === "listening") setExpression("curve-awake");
    else if (state.current === "welcome") startExpressionCycle();
  }

  function stopAll() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (state.recognition && state.listening) { try { state.recognition.stop(); } catch (_) {} }
    state.listening = false;
    els.micButton.classList.remove("listening");
    setStatus("ready");
  }

  function speak(text) {
    if (!state.soundOn || !("speechSynthesis" in window) || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/PLACEHOLDER/gi, "ข้อมูลตัวอย่าง"));
    utterance.lang = "th-TH"; utterance.rate = 1.05; utterance.pitch = 1.35;
    const thaiVoice = window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("th"));
    if (thaiVoice) utterance.voice = thaiVoice;
    utterance.onstart = () => setStatus("speaking");
    utterance.onend = utterance.onerror = () => setStatus("ready");
    window.speechSynthesis.speak(utterance);
  }

  function navigate(name, addHistory = true) {
    stopAll();
    if (addHistory && state.current !== name) state.history.push(state.current);
    state.current = name;
    if (name === "welcome") startExpressionCycle();
    else clearInterval(state.expressionTimer);
    document.body.classList.toggle("is-welcome", name === "welcome");
    screens.forEach((screen) => screen.classList.toggle("active", screen.dataset.screen === name));
    els.backButton.disabled = name === "welcome" || state.history.length === 0;
    els.app.scrollTop = 0; els.app.focus({ preventScroll: true }); resetIdleTimer();
  }

  function restoreWelcome() {
    els.conversationText.textContent = "สวัสดี! ฉันชื่ออัลวิส — ยินดีต้อนรับสู่โรงเรียนมหิดลวิทยานุสรณ์";
    els.conversationHint.textContent = "แตะปุ่มด้านล่าง แล้วมาคุยกันนะ";
    els.startButton.dataset.stage = "hello";
    els.startButton.querySelector(".cta-label").textContent = "คุยกับอัลวิส";
  }
  function goHome() { state.history = []; restoreWelcome(); navigate("welcome", false); }
  function goBack() { if (!state.history.length) return; navigate(state.history.pop(), false); }
  function resetApp() { stopAll(); els.questionInput.value = ""; els.answerText.textContent = "ลองเลือกคำถามแนะนำ หรือพิมพ์คำถามด้านบนได้เลย"; goHome(); }
  function resetIdleTimer() { clearTimeout(state.idleTimer); state.idleTimer = setTimeout(resetApp, 60000); }

  function makeQr(label) { return `<div class="qr-wrap"><div class="qr-placeholder" aria-label="QR Code placeholder"><span>QR<br>PLACEHOLDER</span></div><p><strong>${label}</strong><br>แทนที่ด้วย QR Code จริงก่อนวันงาน</p></div>`; }
  function renderPage(pageId) {
    const page = data.pages[pageId]; if (!page) return;
    els.detailTitle.textContent = page.title;
    let body = `<p class="detail-intro">${page.intro}</p>`;
    if (page.type === "timeline") body += `<div class="timeline">${page.items.map(i => `<div class="timeline-row"><time>${i.time}</time><div><b>${i.title}</b><span>${i.place}</span></div></div>`).join("")}</div>${makeQr(page.qrLabel)}`;
    if (page.type === "cards" || page.type === "recommend") body += `<div class="content-cards">${page.items.map(i => `<article class="content-card"><h3>${i.title}</h3><p>${i.text}</p></article>`).join("")}</div>`;
    if (page.type === "map") body += `<div class="map-placeholder"><div><strong>พื้นที่สำหรับแผนผังงานจริง</strong><div class="location-tags">${page.locations.map(x => `<span>${x}</span>`).join("")}</div></div></div>${makeQr(page.qrLabel)}`;
    els.detailContent.innerHTML = body; navigate("detail"); speak(page.title);
  }

  function findAnswer(rawQuestion) {
    const normalized = rawQuestion.trim().toLowerCase().replace(/[?？!！.,]/g, "");
    if (!normalized) return "กรุณาพิมพ์คำถามก่อนกดถาม";
    let best = null;
    data.qa.forEach((item) => {
      const score = item.keywords.reduce((sum, keyword) => sum + (normalized.includes(keyword.toLowerCase()) ? keyword.length : 0), 0);
      if (score && (!best || score > best.score)) best = { item, score };
    });
    return best ? best.item.answer : data.fallback;
  }

  function ask(question) { const answer = findAnswer(question); els.answerText.textContent = answer; speak(answer); resetIdleTimer(); }

  function initRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition(); recognition.lang = "th-TH"; recognition.interimResults = false; recognition.maxAlternatives = 1;
    recognition.onstart = () => { state.listening = true; els.micButton.classList.add("listening"); setStatus("listening"); };
    recognition.onresult = (event) => { const text = event.results[0][0].transcript; els.questionInput.value = text; ask(text); };
    recognition.onerror = (event) => { els.answerText.textContent = event.error === "not-allowed" ? "Chrome ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน กรุณาตรวจสอบ Site settings" : "ไม่ได้ยินคำถามชัดเจน กรุณาลองใหม่หรือพิมพ์คำถาม"; };
    recognition.onend = () => { state.listening = false; els.micButton.classList.remove("listening"); if (!window.speechSynthesis.speaking) setStatus("ready"); };
    state.recognition = recognition; els.micButton.hidden = false; els.micNote.textContent = "แตะปุ่มพูด แล้วอนุญาตให้ Chrome ใช้ไมโครโฟน";
  }

  data.menuItems.forEach((item) => {
    const button = document.createElement("button"); button.type = "button"; button.className = `menu-card ${item.color}`;
    button.innerHTML = `<span class="menu-icon" aria-hidden="true">${item.icon}</span><h3>${item.title}</h3><p>${item.subtitle}</p>`;
    button.addEventListener("click", () => item.id === "ask" ? navigate("ask") : renderPage(item.id)); els.menuGrid.appendChild(button);
  });
  data.qa.slice(0, 8).forEach((item) => { const button = document.createElement("button"); button.type = "button"; button.textContent = item.question; button.addEventListener("click", () => { els.questionInput.value = item.question; ask(item.question); }); els.suggestionList.appendChild(button); });

  els.startButton.addEventListener("click", () => {
    if (els.startButton.dataset.stage === "hello") {
      const greeting = "สวัสดี ฉันชื่อ Alvis ยินดีต้อนรับสู่โรงเรียนมหิดลวิทยานุสรณ์ วันนี้อยากให้ช่วยเรื่องอะไร";
      els.conversationText.textContent = "ดีใจที่ได้พบกัน! วันนี้อยากให้ฉันช่วยเรื่องอะไร?";
      els.conversationHint.textContent = "ฉันมีกำหนดการ แผนที่ ข้อมูลโรงเรียน และเรื่องน่าสนใจอีกมากมาย";
      els.startButton.dataset.stage = "menu";
      els.startButton.querySelector(".cta-label").textContent = "เลือกเรื่องที่สนใจ";
      speak(greeting);
    } else {
      navigate("menu");
    }
  });
  $("#homeButton").addEventListener("click", goHome); els.backButton.addEventListener("click", goBack); $("#resetButton").addEventListener("click", resetApp); els.stopButton.addEventListener("click", stopAll);
  els.soundButton.addEventListener("click", () => { state.soundOn = !state.soundOn; els.soundButton.setAttribute("aria-pressed", String(state.soundOn)); els.soundButton.innerHTML = `${state.soundOn ? "🔊 <span>เปิดเสียง</span>" : "🔇 <span>ปิดเสียง</span>"}`; if (!state.soundOn) stopAll(); else speak("เปิดเสียงแล้ว"); resetIdleTimer(); });
  els.questionForm.addEventListener("submit", (event) => { event.preventDefault(); ask(els.questionInput.value); });
  els.micButton.addEventListener("click", () => { stopAll(); try { state.recognition.start(); } catch (_) { els.answerText.textContent = "ไมโครโฟนกำลังทำงานอยู่ กรุณารอสักครู่"; } resetIdleTimer(); });
  ["pointerdown", "keydown", "touchstart"].forEach((eventName) => document.addEventListener(eventName, resetIdleTimer, { passive: true }));
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopAll(); });
  window.addEventListener("beforeunload", stopAll);
  initRecognition(); navigate("welcome", false);
})();
