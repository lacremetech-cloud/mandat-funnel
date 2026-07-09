/* =========================================================================
   PRODIGIO — Logique du funnel
   - Quiz 4 étapes (1 question/écran, avance auto au clic, barre de progression)
   - Écran coordonnées (validation prénom + téléphone obligatoires)
   - Scoring lead 🔥 CHAUD / 🟠 TIÈDE / ⚪️ FROID (invisible pour le prospect)
   - Soumission → webhook CRM + événement Meta (Pixel + CAPI côté serveur)
   - Page merci + bouton Calendly optionnel
   ========================================================================= */
(function () {
  "use strict";

  /* -------------------------------------------------------------------------
     CONFIG — à renseigner en production
     ------------------------------------------------------------------------- */
  var CONFIG = {
    // Endpoint qui crée le contact dans le CRM, applique le tag de scoring,
    // notifie Victor et déclenche la séquence anti-no-show + la CAPI Meta.
    // Sur Systeme.io : l'action de soumission du formulaire natif remplace
    // cet appel. En hébergement custom, pointez vers votre webhook (Make/Zapier/n8n).
    crmWebhookUrl: "", // ex : "https://hook.eu1.make.com/xxxxxxxx"

    // Lien Calendly de Victor (bouton secondaire sur la page merci).
    // Laisser vide pour masquer le bouton.
    calendlyUrl: "", // ex : "https://calendly.com/cyril-prodigio/rdv-vendeur"

    // Redirection éventuelle vers une page merci dédiée (sinon écran inline).
    thankYouRedirect: "" // ex : "/merci"
  };

  var TOTAL_QUESTIONS = 4; // barre de progression sur les 4 questions

  /* -------------------------------------------------------------------------
     ÉTAT
     ------------------------------------------------------------------------- */
  var answers = { type: "", secteur: "", valeur: "", delai: "" };
  var meta = { valeurBand: "", delaiSpeed: "" };
  var history = []; // pile des étapes visitées pour le bouton retour

  /* -------------------------------------------------------------------------
     RÉFÉRENCES DOM
     ------------------------------------------------------------------------- */
  var screens = Array.prototype.slice.call(document.querySelectorAll(".quiz__screen"));
  var barFill = document.getElementById("quizBarFill");
  var stepLabel = document.getElementById("quizStepLabel");
  var backBtn = document.getElementById("quizBack");
  var progressBar = document.querySelector(".quiz__bar");
  var contactForm = document.getElementById("contactForm");
  var submitBtn = document.getElementById("submitBtn");

  function screenByStep(step) {
    return screens.filter(function (s) { return +s.dataset.step === step; })[0];
  }
  function currentStep() {
    var active = document.querySelector(".quiz__screen.is-active");
    return active ? +active.dataset.step : 1;
  }

  /* -------------------------------------------------------------------------
     NAVIGATION ENTRE ÉCRANS
     ------------------------------------------------------------------------- */
  function goToStep(step, record) {
    var target = screenByStep(step);
    if (!target) return;
    if (record !== false) history.push(currentStep());

    screens.forEach(function (s) { s.classList.remove("is-active"); });
    target.classList.add("is-active");

    updateProgress(step);
    manageBackButton();

    // Focus le premier champ de l'écran coordonnées pour le mobile.
    if (step === 5) {
      var first = document.getElementById("firstName");
      if (first) { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }
    }
    // Remonter en haut de la carte quiz pour garder la question visible.
    var card = document.querySelector(".quiz-card");
    if (card && step <= 5) {
      var top = card.getBoundingClientRect().top + window.pageYOffset - 16;
      if (window.pageYOffset > top || step > 1) window.scrollTo({ top: top, behavior: "smooth" });
    }
  }

  function updateProgress(step) {
    var q = Math.min(step, TOTAL_QUESTIONS); // écrans 5/6 restent à 100 %
    var pct = step >= 5 ? 100 : (q / TOTAL_QUESTIONS) * 100;
    barFill.style.width = pct + "%";
    if (progressBar) progressBar.setAttribute("aria-valuenow", String(Math.round(pct)));

    if (step <= TOTAL_QUESTIONS) {
      stepLabel.textContent = "Étape " + q + " sur " + TOTAL_QUESTIONS;
      stepLabel.hidden = false;
    } else if (step === 5) {
      stepLabel.textContent = "Dernière étape";
    } else {
      stepLabel.textContent = "";
    }
  }

  function manageBackButton() {
    var step = currentStep();
    // Pas de retour depuis la 1re question ni depuis la page merci.
    var canGoBack = history.length > 0 && step !== 1 && step !== 6;
    backBtn.hidden = !canGoBack;
  }

  backBtn.addEventListener("click", function () {
    if (!history.length) return;
    var prev = history.pop();
    screens.forEach(function (s) { s.classList.remove("is-active"); });
    screenByStep(prev).classList.add("is-active");
    updateProgress(prev);
    manageBackButton();
  });

  /* -------------------------------------------------------------------------
     RÉPONSES AU QUIZ (avance auto au clic)
     ------------------------------------------------------------------------- */
  document.querySelectorAll(".quiz__screen[data-key] .quiz__opt").forEach(function (opt) {
    opt.addEventListener("click", function () {
      var screen = opt.closest(".quiz__screen");
      var key = screen.dataset.key;
      var step = +screen.dataset.step;

      // Marque la sélection.
      screen.querySelectorAll(".quiz__opt").forEach(function (o) { o.classList.remove("is-selected"); });
      opt.classList.add("is-selected");

      answers[key] = opt.dataset.value;
      if (opt.dataset.band) meta.valeurBand = opt.dataset.band;
      if (opt.dataset.speed) meta.delaiSpeed = opt.dataset.speed;

      if (window.__PRODIGIO_PIXEL_ENABLED__ && window.fbq) {
        fbq("trackCustom", "QuizStep", { step: step, key: key, value: opt.dataset.value });
      }

      // Petite pause pour laisser voir la sélection, puis avance auto.
      setTimeout(function () { goToStep(step + 1); }, 180);
    });
  });

  /* -------------------------------------------------------------------------
     SCORING — 🔥 CHAUD / 🟠 TIÈDE / ⚪️ FROID  (voir brief §4)
     ------------------------------------------------------------------------- */
  function computeLeadScore() {
    var valeurHigh = meta.valeurBand === "high";       // ≥ 300 k€
    var delaiFast = meta.delaiSpeed === "fast";        // ≤ 6 mois
    var delaiMid = meta.delaiSpeed === "mid";          // d'ici 1 an
    var delaiSlow = meta.delaiSpeed === "slow";        // je me renseigne
    var valeurUnknown = meta.valeurBand === "unknown"; // je ne sais pas

    // 🔥 CHAUD : valeur ≥ 300 k€ ET délai ≤ 6 mois → rappel < 1 h
    if (valeurHigh && delaiFast) {
      return { tag: "CHAUD", emoji: "🔥", priority: 1, callWithin: "1h" };
    }
    // ⚪️ FROID : « je me renseigne » OU valeur inconnue → nurturing
    if (delaiSlow || valeurUnknown) {
      return { tag: "FROID", emoji: "⚪️", priority: 3, callWithin: "24h+nurturing" };
    }
    // 🟠 TIÈDE : délai « d'ici 1 an » (et le reste par défaut)
    if (delaiMid) {
      return { tag: "TIEDE", emoji: "🟠", priority: 2, callWithin: "24h" };
    }
    // Filet de sécurité : tout le reste → TIÈDE.
    return { tag: "TIEDE", emoji: "🟠", priority: 2, callWithin: "24h" };
  }

  /* -------------------------------------------------------------------------
     VALIDATION DU FORMULAIRE
     ------------------------------------------------------------------------- */
  function setError(name, message) {
    var input = document.getElementById(name);
    var slot = document.querySelector('[data-error-for="' + name + '"]');
    if (input) input.classList.toggle("is-invalid", !!message);
    if (slot) slot.textContent = message || "";
  }

  function validPhone(value) {
    // Numéro FR/international souple : ≥ 8 chiffres, autorise + espaces . - ( )
    var cleaned = value.replace(/[\s.\-()]/g, "");
    return /^\+?\d{8,15}$/.test(cleaned);
  }
  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function validateForm() {
    var ok = true;
    var firstName = document.getElementById("firstName").value.trim();
    var phone = document.getElementById("phone").value.trim();
    var email = document.getElementById("email").value.trim();

    if (!firstName) { setError("firstName", "Merci d'indiquer votre prénom."); ok = false; }
    else setError("firstName", "");

    if (!phone) { setError("phone", "Merci d'indiquer votre téléphone."); ok = false; }
    else if (!validPhone(phone)) { setError("phone", "Numéro de téléphone invalide."); ok = false; }
    else setError("phone", "");

    // Email facultatif : validé seulement s'il est renseigné.
    if (email && !validEmail(email)) { setError("email", "Adresse email invalide."); ok = false; }
    else setError("email", "");

    return ok;
  }

  // Nettoie l'erreur pendant la saisie.
  ["firstName", "phone", "email"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("input", function () { setError(id, ""); });
  });

  /* -------------------------------------------------------------------------
     SOUMISSION
     ------------------------------------------------------------------------- */
  contactForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!validateForm()) return;

    var score = computeLeadScore();
    var payload = {
      // Coordonnées
      firstName: document.getElementById("firstName").value.trim(),
      phone: document.getElementById("phone").value.trim(),
      email: document.getElementById("email").value.trim(),
      // Réponses quiz
      type: answers.type,
      secteur: answers.secteur,
      valeur: answers.valeur,
      delai: answers.delai,
      // Scoring (tag CRM)
      leadTag: score.tag,
      leadPriority: score.priority,
      callWithin: score.callWithin,
      // Contexte
      source: "funnel-prodigio",
      pageUrl: window.location.href,
      submittedAt: new Date().toISOString()
    };

    submitBtn.setAttribute("aria-busy", "true");
    submitBtn.disabled = true;

    submitLead(payload)
      .then(function () { onSubmitSuccess(payload); })
      .catch(function (err) {
        // On ne bloque jamais le prospect : on affiche la page merci malgré tout,
        // le lead est conservé pour renvoi (voir stashFailedLead).
        console.error("[Prodigio] Échec envoi CRM :", err);
        stashFailedLead(payload);
        onSubmitSuccess(payload);
      });
  });

  function submitLead(payload) {
    // Meta Pixel : événement Lead côté client (dédupliqué avec la CAPI via eventID si besoin).
    if (window.__PRODIGIO_PIXEL_ENABLED__ && window.fbq) {
      fbq("track", "Lead", {
        content_name: "Mandat vendeur",
        content_category: payload.leadTag,
        value: 0,
        currency: "EUR"
      });
    }

    if (!CONFIG.crmWebhookUrl) {
      // Pas de webhook configuré (ex : formulaire natif Systeme.io gère l'envoi).
      // On résout immédiatement pour dérouler la page merci.
      return Promise.resolve();
    }

    return fetch(CONFIG.crmWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res;
    });
  }

  function stashFailedLead(payload) {
    try {
      var key = "prodigio_failed_leads";
      var arr = JSON.parse(localStorage.getItem(key) || "[]");
      arr.push(payload);
      localStorage.setItem(key, JSON.stringify(arr));
    } catch (e) { /* stockage indisponible : on ignore */ }
  }

  function onSubmitSuccess(payload) {
    // Redirection vers page merci dédiée si configurée.
    if (CONFIG.thankYouRedirect) {
      window.location.href = CONFIG.thankYouRedirect;
      return;
    }
    // Sinon : écran merci inline.
    document.getElementById("thanksName").textContent = payload.firstName + " !";

    // Bouton Calendly optionnel.
    var cal = document.getElementById("calendlyBtn");
    if (CONFIG.calendlyUrl && cal) {
      cal.href = CONFIG.calendlyUrl;
      cal.target = "_blank";
      cal.rel = "noopener";
      cal.hidden = false;
    }

    history = []; // plus de retour possible depuis la page merci
    goToStep(6, false);
    submitBtn.removeAttribute("aria-busy");
    submitBtn.disabled = false;
  }

  /* -------------------------------------------------------------------------
     LIENS D'ANCRAGE (scroll doux vers le quiz)
     ------------------------------------------------------------------------- */
  document.querySelectorAll("[data-scroll]").forEach(function (link) {
    link.addEventListener("click", function (e) {
      var id = link.getAttribute("href");
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      var top = target.getBoundingClientRect().top + window.pageYOffset - 8;
      window.scrollTo({ top: top, behavior: "smooth" });
    });
  });

  /* -------------------------------------------------------------------------
     INIT
     ------------------------------------------------------------------------- */
  updateProgress(1);
  manageBackButton();
})();
