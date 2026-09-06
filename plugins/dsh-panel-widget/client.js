window.__ModuleLoader__.load({
	// client-modules bundles do not execute with a stable currentScript URL.
	// Keep this equal to package.json.name and the managed roster row id.
	id: "ask-kit-panel",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		let react = require("react");
		//#region ask-kit-panel client — ambient status line under the composer.
		// Prototype semantics only: badge, loaded-skill chips, review nudges.
		// The decision tree lives in the system prompt and is deliberately NOT
		// mirrored here. State arrives reactively via the `askKit` session
		// projection (host fold of `ask-kit/state` whole-value events written
		// by the ask-kit router row); there is no polling RPC anymore.
		const PROJECTION_KEY = "askKit";
		const SLOT_NAME = "conversation.composer.dock";
		const SLOT_ID = "ask-kit-status";
		const STYLE_TAG_ID = "ask-kit-panel/status.css";
		const CSS = ".askk-bar{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary);padding:2px 4px;flex-wrap:wrap}" +
			".askk-badge{color:var(--dsw-alias-brand-primary);font-weight:600;white-space:nowrap}" +
			".askk-chip{border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:0 7px;line-height:16px;background:var(--dsw-alias-bg-layer-1);white-space:nowrap}" +
			".askk-warn{color:var(--dsw-alias-state-warn-primary)}" +
			".askk-ok{color:var(--dsw-alias-state-success-primary)}";
		/**
		* Insert the panel stylesheet once, shipped-package style, so HMR
		* bookkeeping can find and remove the tag again.
		*/
		function insertCss() {
			try {
				if (typeof document === "undefined") return;
				if (document.querySelector('style[data-plugin-css="' + STYLE_TAG_ID + '"]') !== null) return;
				const tag = document.createElement("style");
				tag.dataset.plugin = "ask-kit-panel";
				tag.dataset.pluginCss = STYLE_TAG_ID;
				tag.textContent = CSS;
				document.head.appendChild(tag);
			} catch { /* styling is cosmetic; never block activation */ }
		}
		/**
		* Coerce one raw projection value into the render shape, returning null
		* for anything absent or malformed so shape drift degrades to a hidden
		* panel instead of a broken one.
		* @param value - whole projection view or undefined/null.
		* @returns normalized view object, or null when there is nothing to show.
		*/
		function normalizeView(value) {
			if (!value || typeof value !== "object") return null;
			const loadedSkills = Array.isArray(value.loadedSkills)
				? [...new Set(value.loadedSkills.filter((s) => typeof s === "string" && s.trim()))].slice(-6)
				: [];
			return {
				loadedSkills,
				lastMatch: typeof value.lastMatch === "string" ? value.lastMatch : "",
				needsCodeReview: value.needsCodeReview === true,
				needsDesignReview: value.needsDesignReview === true,
				shouldCaptureImprovement: value.shouldCaptureImprovement === true,
			};
		}
		/**
		* Resolve the observable projection face for one session, tolerating
		* every rc-stage contract gap (no binding, no projections store, old
		* face shape) by returning undefined.
		* @param sessions - the client sessions service.
		* @param sessionId - active session id or undefined.
		* @returns {getSnapshot,subscribe} face, or undefined.
		*/
		function faceFor(sessions, sessionId) {
			if (!sessions || typeof sessions.binding !== "function" || typeof sessionId !== "string") return undefined;
			try {
				const projections = sessions.binding(sessionId)?.session?.projections;
				if (projections === undefined || typeof projections.faceOf !== "function") return undefined;
				const face = projections.faceOf(PROJECTION_KEY);
				if (face === undefined || typeof face.getSnapshot !== "function") return undefined;
				return face;
			} catch { return undefined }
		}
		/**
		* Subscribe one component to the projection value for a session. A hand-
		* rolled external-store subscription (instead of useSyncExternalStore)
		* keeps working on older React builds and never throws on contract gaps.
		* @param faceFactory - stable zero-arg resolver for the current face.
		* @returns the latest snapshot value (undefined while absent).
		*/
		function useProjectionValue(faceFactory) {
			const [value, setValue] = react.useState(() => {
				try {
					const face = faceFactory();
					return face ? face.getSnapshot() : undefined;
				} catch { return undefined }
			});
			react.useEffect(() => {
				let alive = true;
				let unsubscribe;
				try {
					const face = faceFactory();
					if (face) {
						setValue(face.getSnapshot());
						if (typeof face.subscribe === "function") {
							unsubscribe = face.subscribe(() => {
								if (!alive) return;
								try { setValue(face.getSnapshot()) } catch { /* next frame retries */ }
							});
						}
					}
				} catch { /* capability absent: stay hidden */ }
				return () => {
					alive = false;
					try { if (typeof unsubscribe === "function") unsubscribe() } catch { /* already gone */ }
				};
			}, [faceFactory]);
			return value;
		}
		/**
		* Ambient dock entry: one slim status line of chips and nudges, hidden
		* entirely until the session carries an askKit projection value.
		* @param props - slot props ({session, input}); only session.sessionId is read.
		* @param sessions - captured client sessions service.
		*/
		function StatusPanel(props, sessions) {
			const sessionId = props?.session?.sessionId;
			const sessionsRef = react.useRef(sessions);
			sessionsRef.current = sessions;
			const faceFactory = react.useCallback(() => faceFor(sessionsRef.current, sessionId), [sessionId]);
			const raw = useProjectionValue(faceFactory);
			const data = normalizeView(raw);
			if (!data) return null;
			const chips = [];
			if (data.loadedSkills.length > 0) {
				for (const s of data.loadedSkills) chips.push(react.createElement("span", { className: "askk-chip", key: s }, s));
			} else {
				chips.push(react.createElement("span", { className: "askk-chip", key: "none" }, "no skill loaded"));
			}
			const notes = [];
			if (data.needsCodeReview) notes.push(react.createElement("span", { className: "askk-warn", key: "cr" }, "⚠ code-review needed"));
			if (data.needsDesignReview) notes.push(react.createElement("span", { className: "askk-warn", key: "dr" }, "⚠ design-review needed"));
			if (data.shouldCaptureImprovement) notes.push(react.createElement("span", { className: "askk-ok", key: "imp" }, "✓ capture improvement?"));
			if (data.lastMatch && data.loadedSkills.length === 0) notes.push(react.createElement("span", { key: "match" }, "match: " + data.lastMatch));
			return react.createElement("div", { className: "askk-bar" },
				react.createElement("span", { className: "askk-badge" }, "╌ Agent Skills Kit ╌"),
				chips,
				notes);
		}
		/**
		* Client plugin body: stylesheet plus the composer dock registration.
		* @param ctx - client root context (slots + sessions services expected).
		*/
		function apply(ctx) {
			insertCss();
			let slots;
			let sessions;
			try {
				slots = ctx.slots;
				sessions = ctx.sessions;
			} catch { return }
			if (slots === undefined || sessions === undefined) return;
			slots.inject(SLOT_NAME, () => slots.register(
				{ name: SLOT_NAME, id: SLOT_ID, order: 50 },
				(props) => StatusPanel(props, sessions),
			));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = ["slots", "sessions"];
		return module.exports;
	}
});
