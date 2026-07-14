export type Locale = "de" | "en";

export function isLocale(value: string): value is Locale {
  return value === "de" || value === "en";
}

const messages = {
  // Boot & Shell
  "boot.checkingSession": {
    de: "Appwrite-Sitzung wird geprüft.",
    en: "Checking your Appwrite session.",
  },
  "boot.loadingData": {
    de: "Daten werden aus Appwrite geladen.",
    en: "Loading your data from Appwrite.",
  },
  "boot.setupTitle": { de: "Appwrite Setup", en: "Appwrite setup" },
  "boot.loadErrorFallback": {
    de: "Die Appwrite-Daten konnten nicht geladen werden.",
    en: "Your Appwrite data could not be loaded.",
  },
  "sync.failed": {
    de: "„{label}“ konnte nicht gespeichert werden: {detail}",
    en: "“{label}” could not be saved: {detail}",
  },
  "sync.discard": { de: "Änderung verwerfen", en: "Discard change" },
  "sync.offline": {
    de: "Du bist offline. Änderungen werden lokal gespeichert und synchronisiert, sobald du wieder online bist.",
    en: "You are offline. Changes are stored locally and will sync once you are back online.",
  },
  "sync.offlinePending.one": {
    de: "Du bist offline. {count} Änderung wartet auf die Synchronisation.",
    en: "You are offline. {count} change is waiting to sync.",
  },
  "sync.offlinePending.many": {
    de: "Du bist offline. {count} Änderungen warten auf die Synchronisation.",
    en: "You are offline. {count} changes are waiting to sync.",
  },
  "sync.cachedNotice": {
    de: "Angezeigt wird der zuletzt gespeicherte Stand.",
    en: "Showing the last saved state.",
  },
  "common.retry": { de: "Erneut versuchen", en: "Try again" },
  "common.save": { de: "Speichern", en: "Save" },
  "common.cancel": { de: "Abbrechen", en: "Cancel" },
  "common.delete": { de: "Löschen", en: "Delete" },
  "common.close": { de: "Schließen", en: "Close" },
  "common.back": { de: "Zurück", en: "Back" },
  "common.pleaseWait": { de: "Bitte warten...", en: "Please wait..." },
  "common.undo": { de: "Rückgängig", en: "Undo" },
  "error.unexpected": {
    de: "Unerwarteter Fehler. Bitte versuche es erneut.",
    en: "Unexpected error. Please try again.",
  },
  "undo.taskDeleted": { de: "Aufgabe gelöscht.", en: "Task deleted." },
  "undo.projectDeleted": {
    de: "Projekt samt Aufgaben gelöscht.",
    en: "Project and its tasks deleted.",
  },

  // Auth
  "auth.title.login": { de: "Anmelden", en: "Sign in" },
  "auth.title.register": { de: "Account erstellen", en: "Create account" },
  "auth.title.recover": { de: "Passwort zurücksetzen", en: "Reset password" },
  "auth.recoverHint": {
    de: "Wir schicken dir einen Link, mit dem du ein neues Passwort setzen kannst.",
    en: "We will send you a link to set a new password.",
  },
  "auth.name": { de: "Name", en: "Name" },
  "auth.email": { de: "E-Mail", en: "Email" },
  "auth.password": { de: "Passwort", en: "Password" },
  "auth.submit.login": { de: "Anmelden", en: "Sign in" },
  "auth.submit.register": { de: "Registrieren", en: "Register" },
  "auth.submit.recover": { de: "Link anfordern", en: "Request link" },
  "auth.toRegister": {
    de: "Noch kein Account? Registrieren",
    en: "No account yet? Register",
  },
  "auth.toRecover": { de: "Passwort vergessen?", en: "Forgot your password?" },
  "auth.backToLogin.register": {
    de: "Schon registriert? Anmelden",
    en: "Already registered? Sign in",
  },
  "auth.backToLogin.recover": {
    de: "Zurück zur Anmeldung",
    en: "Back to sign-in",
  },
  "auth.recoverySent": {
    de: "E-Mail verschickt. Öffne den Link aus der Nachricht, um ein neues Passwort zu setzen.",
    en: "Email sent. Open the link in the message to set a new password.",
  },

  // Welcome
  "welcome.kicker": { de: "Webbasiertes Capture-Tool", en: "Web-based capture tool" },
  "welcome.tagline": {
    de: "Der rote Faden für deine Projekte.",
    en: "The red thread through your projects.",
  },
  "welcome.motto": {
    de: "Organisiere Gedanken. Strukturiere Projekte. Verändere die Welt.",
    en: "Organize thoughts. Structure projects. Change the world.",
  },
  "welcome.desc": {
    de: "Zuerst als schnelles Webtool gedacht: am Handy sofort erfassen, am Desktop Aufgaben, Projekte und KI-Vorschläge bequem prüfen. Die Oberfläche bleibt später gut als Android-App adaptierbar.",
    en: "Built web-first: capture instantly on your phone, then review tasks, projects and AI suggestions comfortably on desktop. The interface stays ready for a later Android app.",
  },
  "welcome.start": { de: "Los geht's", en: "Let's go" },
  "welcome.imageAlt": {
    de: "Bewegungssilhouette mit roter Flagge",
    en: "Movement silhouette with a red flag",
  },

  // Today
  "today.title": { de: "Heute", en: "Today" },
  "today.openMore": { de: "Mehr öffnen", en: "Open more" },
  "today.openInbox": { de: "Inbox öffnen", en: "Open inbox" },
  "today.openSearch": { de: "Suche öffnen", en: "Open search" },
  "today.capturePrompt": { de: "Was beschäftigt dich?", en: "What's on your mind?" },
  "today.aiUpdate": { de: "KI-Update", en: "AI update" },
  "briefing.title": { de: "Tagesbriefing", en: "Daily briefing" },
  "briefing.generate": { de: "Briefing erstellen", en: "Create briefing" },
  "briefing.loading": { de: "Briefing wird erstellt...", en: "Creating briefing..." },
  "briefing.empty": {
    de: "Keine offenen Aufgaben – alles erledigt.",
    en: "No open tasks – all clear.",
  },
  "today.notesProcessed.one": { de: "{count} Notiz verarbeitet", en: "{count} note processed" },
  "today.notesProcessed.many": { de: "{count} Notizen verarbeitet", en: "{count} notes processed" },
  "today.accepted": { de: "{count} übernommen", en: "{count} accepted" },
  "today.toReview": { de: "{count} zu prüfen", en: "{count} to review" },
  "today.myTasks": { de: "Meine Aufgaben", en: "My tasks" },
  "today.showAll": { de: "Alle anzeigen", en: "Show all" },
  "today.welcomeTitle": { de: "Willkommen bei Rote Agenda", en: "Welcome to Rote Agenda" },
  "today.welcomeText": {
    de: "Halte einfach fest, was dich beschäftigt. Die KI macht daraus Aufgabenvorschläge, die du prüfst und übernimmst.",
    en: "Just capture whatever is on your mind. The AI turns it into task suggestions for you to review and accept.",
  },
  "today.captureFirst": { de: "Erste Notiz erfassen", en: "Capture your first note" },
  "today.emptyTitle": { de: "Keine Aufgaben in dieser Ansicht", en: "No tasks in this view" },
  "today.emptyText": {
    de: "Alles ruhig. Neue Rohnotizen landen zuerst im Capture.",
    en: "All quiet. New raw notes start in capture.",
  },
  "filter.all": { de: "Alle", en: "All" },
  "filter.today": { de: "Heute", en: "Today" },
  "filter.planned": { de: "Geplant", en: "Planned" },
  "filter.later": { de: "Später", en: "Later" },
  "task.overdue": { de: "Überfällig", en: "Overdue" },

  // Capture
  "capture.title": { de: "Schnellnotiz", en: "Quick note" },
  "capture.placeholder": {
    de: "Schreib einfach alles rein – Gedanken, Aufgaben, Notizen, Gesprächsfetzen…",
    en: "Just write anything – thoughts, tasks, notes, conversation snippets…",
  },
  "capture.process": { de: "Mit {model} verarbeiten", en: "Process with {model}" },
  "capture.processing": { de: "KI verarbeitet...", en: "AI is processing..." },
  "capture.examples": {
    de: "Beispiele: „Chef meinte, ich soll bis Freitag nochmal die Präsentation überarbeiten“ oder „Idee: Register-Fälle automatisch clustern“.",
    en: "Examples: “Boss said I should revise the presentation again by Friday” or “Idea: cluster registry cases automatically”.",
  },
  "capture.mic.start": { de: "Notiz einsprechen", en: "Dictate a note" },
  "capture.mic.stop": { de: "Aufnahme stoppen", en: "Stop recording" },
  "capture.mic.listening": {
    de: "Aufnahme läuft – zum Stoppen aufs Mikrofon tippen.",
    en: "Recording – tap the microphone to stop.",
  },
  "capture.mic.transcribing": {
    de: "Wird transkribiert...",
    en: "Transcribing...",
  },
  "capture.mic.denied": {
    de: "Mikrofon-Zugriff wurde abgelehnt. Erlaube ihn in den Browser-Einstellungen.",
    en: "Microphone access was denied. Allow it in your browser settings.",
  },
  "capture.mic.error": {
    de: "Die Spracheingabe hat nicht geklappt. Versuche es erneut.",
    en: "Speech input failed. Please try again.",
  },
  "capture.photo.start": {
    de: "Notizzettel fotografieren",
    en: "Scan a note photo",
  },
  "capture.photo.processing": {
    de: "Foto wird gelesen...",
    en: "Reading photo...",
  },
  "capture.photo.error": {
    de: "Das Foto konnte nicht gelesen werden. Versuche es erneut.",
    en: "The photo could not be read. Please try again.",
  },
  "capture.noNewTasks": {
    de: "Keine neuen Aufgaben erkannt – alles aus der Notiz existiert bereits als offene Aufgabe.",
    en: "No new tasks detected – everything in the note already exists as an open task.",
  },

  // Notizen
  "notes.title": { de: "Notizen", en: "Notes" },
  "notes.new": { de: "Neue Notiz anlegen", en: "Create a new note" },
  "notes.emptyTitle": { de: "Noch keine Notizen", en: "No notes yet" },
  "notes.emptyText": {
    de: "Halte Gedanken, Ideen und Gesprächsfetzen fest. Die KI formuliert sie aus, vergibt Tags, verlinkt verwandte Notizen und erkennt Aufgaben und Termine.",
    en: "Capture thoughts, ideas and snippets. The AI rewrites them, adds tags, links related notes and detects tasks and events.",
  },
  "notes.create": { de: "Notiz anlegen", en: "Create note" },
  "notes.importPlaceholder": {
    de: "Link einfügen (Artikel oder YouTube)…",
    en: "Paste a link (article or YouTube)…",
  },
  "notes.importGo": { de: "Zusammenfassen", en: "Summarize" },
  "notes.importImage": {
    de: "Screenshot/Foto als Notiz",
    en: "Screenshot/photo as note",
  },
  "notes.importing": { de: "Wird analysiert...", en: "Analyzing..." },
  "notes.pinned": { de: "Angepinnt", en: "Pinned" },
  "notes.others": { de: "Weitere", en: "Others" },
  "notes.untitled": { de: "Ohne Titel", en: "Untitled" },
  "note.kicker": { de: "Notiz", en: "Note" },
  "note.edit": { de: "Notiz bearbeiten", en: "Edit note" },
  "note.pin": { de: "Anpinnen", en: "Pin" },
  "note.unpin": { de: "Lösen", en: "Unpin" },
  "note.enhancedHeading": { de: "Ausformuliert", en: "Refined" },
  "note.originalHeading": { de: "Original", en: "Original" },
  "note.relatedHeading": { de: "Verknüpfte Notizen", en: "Linked notes" },
  "note.tasksHeading": { de: "Aufgaben aus dieser Notiz", en: "Tasks from this note" },
  "note.enhance": { de: "Mit KI verarbeiten", en: "Process with AI" },
  "note.enhanceAgain": { de: "Erneut mit KI verarbeiten", en: "Process with AI again" },
  "note.enhancing": { de: "KI verarbeitet...", en: "AI is processing..." },
  "note.notProcessed": {
    de: "Diese Notiz wurde noch nicht von der KI verarbeitet.",
    en: "This note has not been processed by the AI yet.",
  },
  "note.pendingUrl": {
    de: "Der Link wird im Hintergrund analysiert – bei Videos kann das ein paar Minuten dauern. Die Notiz füllt sich automatisch.",
    en: "The link is being analyzed in the background – videos can take a few minutes. The note fills in automatically.",
  },
  "note.pendingImage": {
    de: "Das Foto wird im Hintergrund gelesen. Die Notiz füllt sich automatisch.",
    en: "The photo is being read in the background. The note fills in automatically.",
  },
  "note.processingFailed": {
    de: "Analyse fehlgeschlagen: {detail}",
    en: "Processing failed: {detail}",
  },
  "notes.pendingCard": { de: "Wird analysiert…", en: "Analyzing…" },
  "note.suggestionsReady.one": {
    de: "{count} neuer Vorschlag liegt in der Inbox.",
    en: "{count} new suggestion is waiting in the inbox.",
  },
  "note.suggestionsReady.many": {
    de: "{count} neue Vorschläge liegen in der Inbox.",
    en: "{count} new suggestions are waiting in the inbox.",
  },
  "note.openInbox": { de: "Zur Inbox", en: "Open inbox" },
  "note.photoAlt": { de: "Angehängtes Foto", en: "Attached photo" },
  "note.photoOpen": {
    de: "Foto in Großansicht öffnen",
    en: "Open photo in full view",
  },
  "note.source.manual": { de: "Manuell", en: "Manual" },
  "note.source.capture": { de: "Schnellnotiz", en: "Quick capture" },
  "note.source.url": { de: "Link", en: "Link" },
  "note.source.image": { de: "Foto", en: "Photo" },
  "graph.title": { de: "Wissensnetz", en: "Knowledge graph" },
  "graph.showTags": { de: "Tags anzeigen", en: "Show tags" },
  "graph.hideOrphans": { de: "Unverbundene ausblenden", en: "Hide unlinked" },
  "graph.fit": { de: "Ansicht einpassen", en: "Fit view" },
  "graph.stats": {
    de: "{notes} Notizen · {links} Verbindungen",
    en: "{notes} notes · {links} links",
  },
  "graph.aria": {
    de: "Interaktives Netz aus Notizen, Verlinkungen und Tags",
    en: "Interactive network of notes, links and tags",
  },
  "graph.hint": {
    de: "Ziehen verschiebt, Scrollen/Kneifen zoomt, Klick wählt einen Knoten aus, Doppelklick passt die Ansicht ein.",
    en: "Drag to pan, scroll or pinch to zoom, click selects a node, double-click fits the view.",
  },
  "graph.searchPlaceholder": {
    de: "Notizen filtern (#tag möglich)…",
    en: "Filter notes (#tag works)…",
  },
  "graph.noMatches": {
    de: "Keine Treffer für die aktuellen Filter.",
    en: "No matches for the current filters.",
  },
  "graph.openNote": { de: "Notiz öffnen", en: "Open note" },
  "graph.filterTag": { de: "Als Suche übernehmen", en: "Use as search" },
  "graph.selected.links": {
    de: "{count} Verbindungen",
    en: "{count} links",
  },
  "graph.settings": { de: "Darstellung", en: "Appearance" },
  "graph.settings.nodeSize": { de: "Knotengröße", en: "Node size" },
  "graph.settings.distance": { de: "Abstand", en: "Spacing" },
  "graph.settings.distance.compact": { de: "Kompakt", en: "Compact" },
  "graph.settings.distance.normal": { de: "Normal", en: "Normal" },
  "graph.settings.distance.wide": { de: "Weit", en: "Wide" },
  "graph.settings.labels": { de: "Beschriftungen", en: "Labels" },
  "graph.settings.labels.off": { de: "Aus", en: "Off" },
  "graph.settings.labels.auto": { de: "Beim Zoomen", en: "On zoom" },
  "graph.settings.labels.always": { de: "Immer", en: "Always" },
  "graph.settings.halo": { de: "Farbhöfe", en: "Color halos" },
  "graph.analyze": { de: "KI-Analyse", en: "AI insights" },
  "graph.analyzing": { de: "Analysiere…", en: "Analyzing…" },
  "graph.insights.title": { de: "KI-Blick aufs Netz", en: "AI view of your graph" },
  "graph.insights.clusters": { de: "Themen-Cluster", en: "Clusters" },
  "graph.insights.anomalies": { de: "Auffälligkeiten", en: "Notable patterns" },
  "graph.insights.gaps": { de: "Lücken", en: "Gaps" },
  "graph.insights.suggestions": { de: "Vorschläge", en: "Suggestions" },
  "graph.insights.tooFew": {
    de: "Für eine Analyse braucht das Netz mindestens drei Notizen.",
    en: "The analysis needs at least three notes in the graph.",
  },
  "graph.empty.title": { de: "Noch kein Netz", en: "No graph yet" },
  "graph.empty.text": {
    de: "Lege Notizen an und lass die KI sie veredeln — Verlinkungen und Tags erscheinen hier als Wissensnetz.",
    en: "Create notes and let the AI refine them — links and tags will appear here as a knowledge graph.",
  },
  "notes.graph": { de: "Wissensnetz öffnen", en: "Open knowledge graph" },
  "noteEditor.createTitle": { de: "Notiz anlegen", en: "Create note" },
  "noteEditor.editTitle": { de: "Notiz bearbeiten", en: "Edit note" },
  "noteEditor.content": { de: "Inhalt", en: "Content" },
  "noteEditor.tags": {
    de: "Tags (durch Komma getrennt)",
    en: "Tags (comma-separated)",
  },
  "noteEditor.noProject": { de: "Ohne Projekt", en: "No project" },
  "undo.noteDeleted": { de: "Notiz gelöscht.", en: "Note deleted." },

  // Inbox
  "inbox.title": { de: "Inbox", en: "Inbox" },
  "inbox.hint": {
    de: "Ungeprüfte KI-Vorschläge bleiben hier, bis du sie annimmst, änderst oder ablehnst.",
    en: "Unreviewed AI suggestions stay here until you accept, edit, or dismiss them.",
  },
  "inbox.emptyTitle": { de: "Inbox ist leer", en: "Inbox is empty" },
  "inbox.emptyText": { de: "Alle Vorschläge sind geprüft.", en: "All suggestions are reviewed." },

  // Suche
  "search.title": { de: "Suche", en: "Search" },
  "search.placeholder": {
    de: "Aufgaben, Projekte, Notizen…",
    en: "Tasks, projects, notes…",
  },
  "search.hint": {
    de: "Durchsucht Titel, Beschreibungen, Projekt-Keywords und Rohnotizen.",
    en: "Searches titles, descriptions, project keywords and raw notes.",
  },
  "search.empty": {
    de: "Keine Treffer für „{query}“.",
    en: "No results for “{query}”.",
  },
  "search.tasks": { de: "Aufgaben", en: "Tasks" },
  "search.projects": { de: "Projekte", en: "Projects" },
  "search.notes": { de: "Notizen", en: "Notes" },

  // Projects
  "projects.title": { de: "Projekte", en: "Projects" },
  "projects.new": { de: "Neues Projekt anlegen", en: "Create a new project" },
  "projects.emptyTitle": { de: "Noch keine Projekte", en: "No projects yet" },
  "projects.emptyText": {
    de: "Projekte bündeln deine Aufgaben. Die KI schlägt bei neuen Notizen automatisch passende Projekte vor – oder du legst selbst eins an.",
    en: "Projects bundle your tasks. The AI automatically suggests fitting projects for new notes – or you create one yourself.",
  },
  "projects.create": { de: "Projekt anlegen", en: "Create project" },
  "projects.openCount": { de: "{count} offen", en: "{count} open" },
  "projects.noDeadline": { de: "Ohne Deadline", en: "No deadline" },

  // Project detail
  "project.kicker": { de: "Projekt", en: "Project" },
  "project.progress": { de: "Fortschritt", en: "Progress" },
  "project.tab.tasks": { de: "Aufgaben", en: "Tasks" },
  "project.tab.details": { de: "Details", en: "Details" },
  "project.tab.notes": { de: "Notizen", en: "Notes" },
  "project.addTask": { de: "Aufgabe hinzufügen", en: "Add task" },
  "project.aiToggle": { de: "KI-Zuordnung", en: "AI assignment" },
  "project.aiActive": { de: "Für dieses Projekt aktiv", en: "Active for this project" },
  "project.aiPaused": { de: "Für dieses Projekt pausiert", en: "Paused for this project" },
  "project.keywords": { de: "Keywords", en: "Keywords" },
  "project.noteMeta": { de: "Rohnotiz · {date}", en: "Raw note · {date}" },
  "project.notesEmpty": {
    de: "Noch keine Rohnotizen zu diesem Projekt. Sobald die KI Notizen hierher zuordnet, erscheinen sie in dieser Liste.",
    en: "No raw notes for this project yet. As soon as the AI assigns notes here, they appear in this list.",
  },
  "project.edit": { de: "Projekt bearbeiten", en: "Edit project" },

  // Task detail
  "task.fallbackKicker": { de: "Aufgabe", en: "Task" },
  "task.status": { de: "Status", en: "Status" },
  "task.deadline": { de: "Deadline", en: "Due date" },
  "task.priority": { de: "Priorität", en: "Priority" },
  "task.project": { de: "Projekt", en: "Project" },
  "task.noProject": { de: "Ohne Projekt", en: "No project" },
  "task.done": { de: "Erledigt", en: "Done" },
  "task.markDone": { de: "Als erledigt markieren", en: "Mark as done" },
  "task.markOpen": { de: "Als offen markieren", en: "Mark as open" },
  "task.tab.details": { de: "Details", en: "Details" },
  "task.tab.raw": { de: "Rohnotiz", en: "Raw note" },
  "task.tab.ai": { de: "KI", en: "AI" },
  "task.descriptionHeading": { de: "Beschreibung", en: "Description" },
  "task.noDescription": { de: "Keine Beschreibung hinterlegt.", en: "No description yet." },
  "task.rawHeading": { de: "Ursprüngliche Rohnotiz", en: "Original raw note" },
  "task.manualCreated": {
    de: "Diese Aufgabe wurde manuell erstellt.",
    en: "This task was created manually.",
  },
  "task.aiHeading": { de: "KI-Zusammenfassung", en: "AI summary" },
  "task.noAi": { de: "Keine KI-Zusammenfassung vorhanden.", en: "No AI summary available." },
  "task.edit": { de: "Aufgabe bearbeiten", en: "Edit task" },
  "task.reschedule": { de: "Schnell verschieben", en: "Quick reschedule" },
  "status.open": { de: "Offen", en: "Open" },
  "status.in_progress": { de: "In Arbeit", en: "In progress" },
  "status.done": { de: "Erledigt", en: "Done" },
  "priority.low": { de: "Niedrig", en: "Low" },
  "priority.medium": { de: "Mittel", en: "Medium" },
  "priority.high": { de: "Hoch", en: "High" },

  // Suggestions
  "sugg.accepted": { de: "Vorschlag übernommen.", en: "Suggestion accepted." },
  "sugg.rejected": { de: "Vorschlag ignoriert.", en: "Suggestion dismissed." },
  "sugg.status.newProject": { de: "Neues Projekt vorgeschlagen", en: "New project suggested" },
  "sugg.status.project": { de: "Projekt-Vorschlag", en: "Project suggestion" },
  "sugg.status.review": { de: "Rückfrage nötig", en: "Needs review" },
  "sugg.status.unsure": { de: "Unsicher", en: "Uncertain" },
  "sugg.status.confident": { de: "Sicher zugeordnet", en: "Confidently assigned" },
  "sugg.status.event": { de: "Terminvorschlag", en: "Event suggestion" },
  "sugg.eventTime": { de: "Termin", en: "When" },
  "sugg.eventStart": { de: "Beginn", en: "Start" },
  "sugg.acceptEvent": {
    de: "In Google Kalender übernehmen",
    en: "Add to Google Calendar",
  },
  "sugg.eventAccepted": {
    de: "Termin an Google Kalender übergeben.",
    en: "Event handed to Google Calendar.",
  },
  "sugg.projectAccepted": {
    de: "Projekt angelegt und Notiz zugeordnet.",
    en: "Project created and note assigned.",
  },
  "sugg.acceptProject": { de: "Projekt anlegen", en: "Create project" },
  "sugg.projectNewValue": { de: "Neu anlegen", en: "Create new" },
  "sugg.project": { de: "Projekt", en: "Project" },
  "sugg.deadline": { de: "Deadline", en: "Due date" },
  "sugg.priority": { de: "Priorität", en: "Priority" },
  "sugg.source": { de: "Quelle", en: "Source" },
  "sugg.sourceValue": { de: "Rohnotiz", en: "Raw note" },
  "sugg.unclear": { de: "Unklar", en: "Unclear" },
  "sugg.accept": { de: "Übernehmen", en: "Accept" },
  "sugg.edit": { de: "Bearbeiten", en: "Edit" },
  "sugg.reassign": { de: "Anderem Projekt zuordnen", en: "Assign to another project" },
  "sugg.createTask": { de: "Neue Aufgabe erstellen", en: "Create new task" },
  "sugg.ignore": { de: "Ignorieren", en: "Dismiss" },
  "sugg.taskLabel": { de: "Aufgabe", en: "Task" },
  "sugg.newProjectLabel": { de: "Neues Projekt", en: "New project" },
  "sugg.proposeNew": { de: "Neues Projekt vorschlagen", en: "Suggest a new project" },

  // Google-Integration
  "google.addToCalendar": {
    de: "In Google Kalender übernehmen",
    en: "Add to Google Calendar",
  },
  "google.addToTasks": { de: "Als Google Task speichern", en: "Save as Google Task" },
  "google.working": { de: "Wird übertragen...", en: "Sending..." },
  "google.doneCalendar": {
    de: "Im Google Kalender angelegt.",
    en: "Added to Google Calendar.",
  },
  "google.doneTasks": {
    de: "In Google Tasks gespeichert.",
    en: "Saved to Google Tasks.",
  },
  "google.error": {
    de: "Google-Übertragung fehlgeschlagen: {detail}",
    en: "Google transfer failed: {detail}",
  },
  "google.tasksNotConfigured": {
    de: "Für Google Tasks fehlt noch die Einrichtung (NEXT_PUBLIC_GOOGLE_CLIENT_ID, siehe README).",
    en: "Google Tasks still needs setup (NEXT_PUBLIC_GOOGLE_CLIENT_ID, see README).",
  },
  "google.sendAgain": { de: "Erneut übertragen", en: "Send again" },

  // Task editor
  "taskEditor.title": { de: "Aufgabe bearbeiten", en: "Edit task" },
  "editor.titleLabel": { de: "Titel", en: "Title" },
  "editor.description": { de: "Beschreibung", en: "Description" },
  "editor.project": { de: "Projekt", en: "Project" },
  "editor.status": { de: "Status", en: "Status" },
  "editor.priority": { de: "Priorität", en: "Priority" },
  "editor.deadline": { de: "Deadline", en: "Due date" },

  // Project editor
  "projectEditor.createTitle": { de: "Projekt anlegen", en: "Create project" },
  "projectEditor.editTitle": { de: "Projekt bearbeiten", en: "Edit project" },
  "projectEditor.keywords": {
    de: "Keywords (durch Komma getrennt)",
    en: "Keywords (comma-separated)",
  },
  "projectEditor.keywordsPlaceholder": {
    de: "z. B. kunde, angebot, newsletter",
    en: "e.g. client, proposal, newsletter",
  },
  "projectEditor.color": { de: "Farbe", en: "Color" },
  "projectEditor.aiLabel": {
    de: "KI darf Notizen diesem Projekt zuordnen",
    en: "AI may assign notes to this project",
  },
  "projectEditor.deleteConfirm.none": {
    de: "Projekt löschen?",
    en: "Delete this project?",
  },
  "projectEditor.deleteConfirm.one": {
    de: "Projekt löschen – inklusive {count} Aufgabe?",
    en: "Delete this project – including {count} task?",
  },
  "projectEditor.deleteConfirm.many": {
    de: "Projekt löschen – inklusive {count} Aufgaben?",
    en: "Delete this project – including {count} tasks?",
  },
  "projectEditor.confirmYes": { de: "Ja, löschen", en: "Yes, delete" },

  // Navigation & insight panel
  "nav.today": { de: "Heute", en: "Today" },
  "nav.notes": { de: "Notizen", en: "Notes" },
  "nav.graph": { de: "Netz", en: "Graph" },
  "nav.projects": { de: "Projekte", en: "Projects" },
  "nav.inbox": { de: "Inbox", en: "Inbox" },
  "nav.search": { de: "Suche", en: "Search" },
  "nav.more": { de: "Mehr", en: "More" },
  "nav.capture": { de: "Schnellnotiz erfassen", en: "Capture quick note" },
  "nav.captureButton": { de: "Schnell erfassen", en: "Quick capture" },
  "insight.focus": { de: "Fokus", en: "Focus" },
  "insight.openTasks.one": { de: "{count} offene Aufgabe", en: "{count} open task" },
  "insight.openTasks.many": { de: "{count} offene Aufgaben", en: "{count} open tasks" },
  "insight.philosophy": {
    de: "Capture bleibt schnell, die Ordnung passiert danach in Vorschlägen und Projekten.",
    en: "Capture stays fast; organizing happens afterwards in suggestions and projects.",
  },
  "insight.newNote": { de: "Neue Rohnotiz", en: "New raw note" },
  "insight.activeProject": { de: "Aktives Projekt", en: "Active project" },
  "insight.aiReview": { de: "KI-Prüfung", en: "AI review" },
  "insight.pending.one": { de: "{count} Vorschlag offen", en: "{count} suggestion open" },
  "insight.pending.many": { de: "{count} Vorschläge offen", en: "{count} suggestions open" },

  // More / settings
  "more.title": { de: "Mehr", en: "More" },
  "more.product": { de: "Produkt", en: "Product" },
  "more.productValue": { de: "Rote Agenda Webtool", en: "Rote Agenda web tool" },
  "more.account": { de: "Account", en: "Account" },
  "more.storage": { de: "Speicherung", en: "Storage" },
  "more.sync.saving": { de: "Appwrite speichert...", en: "Saving to Appwrite..." },
  "more.sync.error": { de: "Fehler beim Speichern", en: "Saving failed" },
  "more.sync.ok": { de: "Alles gespeichert", en: "Everything saved" },
  "more.sync.offline": {
    de: "Offline – wartet auf Verbindung",
    en: "Offline – waiting to reconnect",
  },
  "more.aiModel": { de: "KI-Modell", en: "AI model" },
  "more.language": { de: "Sprache", en: "Language" },
  "more.theme": { de: "Design", en: "Theme" },
  "theme.system": { de: "System", en: "System" },
  "theme.light": { de: "Hell", en: "Light" },
  "theme.dark": { de: "Dunkel", en: "Dark" },
  "theme.toggle": { de: "Hell/Dunkel umschalten", en: "Toggle light/dark" },
  "more.deleteAll": { de: "Alle Daten löschen", en: "Delete all data" },
  "more.deleteAllTitle": {
    de: "Wirklich alle Projekte, Aufgaben, Notizen und Vorschläge löschen?",
    en: "Really delete all projects, tasks, notes and suggestions?",
  },
  "more.deleteAllText": {
    de: "Das kann nicht rückgängig gemacht werden. Dein Account bleibt bestehen.",
    en: "This cannot be undone. Your account remains.",
  },
  "more.deleteAllYes": { de: "Ja, alles löschen", en: "Yes, delete everything" },
  "more.logout": { de: "Abmelden", en: "Sign out" },
  "legal.impressum": { de: "Impressum", en: "Legal notice" },
  "legal.datenschutz": { de: "Datenschutz", en: "Privacy" },

  // Persist labels (sync queue)
  "entity.task": { de: "Aufgabe", en: "Task" },
  "entity.taskDelete": { de: "Aufgabe löschen", en: "Delete task" },
  "entity.project": { de: "Projekt", en: "Project" },
  "entity.projectNew": { de: "Neues Projekt", en: "New project" },
  "entity.projectDelete": { de: "Projekt löschen", en: "Delete project" },
  "entity.suggestion": { de: "KI-Vorschlag", en: "AI suggestion" },
  "entity.note": { de: "Notiz", en: "Note" },
  "entity.noteDelete": { de: "Notiz löschen", en: "Delete note" },
  "entity.settings": { de: "Einstellungen", en: "Settings" },
  "entity.deleteAll": { de: "Alle Daten löschen", en: "Delete all data" },

  // Dates
  "date.none": { de: "Ohne Termin", en: "No date" },
  "date.yesterday": { de: "Gestern", en: "Yesterday" },
  "date.today": { de: "Heute", en: "Today" },
  "date.tomorrow": { de: "Morgen", en: "Tomorrow" },
  "date.nextWeek": { de: "Nächste Woche", en: "Next week" },

  // Reset password page
  "reset.title": { de: "Neues Passwort setzen", en: "Set a new password" },
  "reset.checking": { de: "Link wird geprüft.", en: "Checking the link." },
  "reset.invalid": {
    de: "Dieser Link ist unvollständig oder abgelaufen. Fordere in der App über „Passwort vergessen?“ einen neuen Link an.",
    en: "This link is incomplete or expired. Request a new one in the app via “Forgot your password?”.",
  },
  "reset.backToApp": { de: "Zurück zur App", en: "Back to the app" },
  "reset.done": {
    de: "Dein Passwort wurde geändert. Du kannst dich jetzt mit dem neuen Passwort anmelden.",
    en: "Your password has been changed. You can now sign in with the new password.",
  },
  "reset.toLogin": { de: "Zur Anmeldung", en: "Go to sign-in" },
  "reset.newPassword": { de: "Neues Passwort", en: "New password" },
  "reset.repeat": { de: "Passwort wiederholen", en: "Repeat password" },
  "reset.mismatch": {
    de: "Die Passwörter stimmen nicht überein.",
    en: "The passwords do not match.",
  },
  "reset.error": {
    de: "Das Passwort konnte nicht gesetzt werden. Fordere ggf. einen neuen Link an.",
    en: "The password could not be set. Request a new link if needed.",
  },
  "reset.submit": { de: "Passwort speichern", en: "Save password" },
} as const;

export type MessageKey = keyof typeof messages;

export type Translator = (
  key: MessageKey,
  params?: Record<string, string | number>,
) => string;

export function translate(
  locale: Locale,
  key: MessageKey,
  params?: Record<string, string | number>,
) {
  // Typsicherheit deckt nur statische Keys ab — bei dynamisch gebauten
  // Keys (`theme.${option}` u. ä.) darf ein Lücken-Key nicht crashen.
  let text: string = messages[key]?.[locale] ?? messages[key]?.de ?? String(key);

  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }

  return text;
}

const LOCALE_STORAGE_KEY = "rote-agenda-locale";

export function detectDeviceLocale(): Locale {
  if (typeof window === "undefined") return "de";

  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && isLocale(stored)) return stored;
  } catch {
    // localStorage kann fehlen; dann entscheidet die Browsersprache.
  }

  return window.navigator.language?.toLowerCase().startsWith("de") ? "de" : "en";
}

export function storeDeviceLocale(locale: Locale) {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Ohne localStorage gilt die Wahl nur für die aktuelle Sitzung.
  }
}
