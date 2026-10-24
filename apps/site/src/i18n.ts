// English lives in index.html, so the page reads fine before (or without)
// JavaScript. Other languages replace text by key. Tool names, code and
// format names stay as they are in every language.

export type Lang = "en" | "id" | "es" | "ja";
type Dict = Record<string, string>;

const id: Dict = {
  skip: "Langsung ke isi",
  "nav.loop": "Cara kerja", "nav.sees": "Yang dilihat agen", "nav.tools": "Tool", "nav.exports": "Ekspor", "nav.ledger": "Ledger", "nav.install": "Pasang",
  "lang.label": "Bahasa", copy: "Salin", copied: "Tersalin",
  "hero.kicker": "Server MCP untuk Claude Code, Antigravity, Codex, dan agen lain. Jalan di Windows, macOS, dan Linux.",
  "hero.title": "Editor video yang bisa <em>dilihat</em> agen Anda.",
  "hero.lede": "Cutloupe memberi agen Anda timeline sungguhan. Agen memotong, memberi judul, caption, dan musik, sementara Anda melihat setiap editan muncul di studio. Sebelum bilang selesai, agen merender frame aslinya dan memeriksanya sendiri.",
  "hero.demo": "Buka demo studio", "hero.watch": "Tonton walkthrough", "hero.pop": "Buka layar penuh", "hero.start": "Mulai sesi demo",
  "hero.caption": "Ini studio yang asli, berjalan di browser Anda dan dikendalikan agen berskrip yang memakai operasi yang sama dengan server MCP. Warna amber menandai editan agen. Coba geser klip sendiri; sesi tetap berjalan.",
  "loop.eyebrow": "Cara kerja", "loop.title": "Edit, tampilkan, lihat, perbaiki.",
  "loop.lede": "Kebanyakan tool video untuk agen hanya menulis file lalu berharap hasilnya benar. Cutloupe menutup putarannya, jadi agen menemukan kesalahannya sendiri sebelum Anda harus menunjukkannya.",
  "loop.s1.t": "Agen mengedit", "loop.s1.p": "Setiap panggilan, misalnya add_text atau split_clip, menjadi satu operasi di timeline bersama. Satu batch diterapkan utuh atau tidak sama sekali, dan setiap langkah bisa di-undo.",
  "loop.s2.t": "Anda melihatnya muncul", "loop.s2.p": "Studio menggambar ulang di frame berikutnya. Klip yang disentuh agen menyala amber dengan catatan apa yang berubah. Editan Anda tampil biru, dan agen juga melihatnya.",
  "loop.s3.t": "Agen melihat hasilnya", "loop.s3.p": "Tool look merender frame dengan compositor yang sama dengan ekspor MP4, lalu mengembalikan gambar dan daftar semua yang ada di layar. Anda bisa melihat bagian mana yang diperiksa.",
  "loop.s4.t": "Agen memperbaiki temuannya", "loop.s4.p": "Kalau subjudul menimpa judul, agen menyadarinya, memindahkannya, lalu memeriksa lagi. Demo di atas sengaja membuat kesalahan itu di detik 2,5.",
  "walk.eyebrow": "Walkthrough", "walk.title": "Dari awal sampai ekspor.",
  "walk.lede": "Direkam di Chrome headless dari studio asli dan halaman ini, lalu diberi musik dari library Cutloupe sendiri. Tidak ada narasi; caption sudah tertanam di gambar.",
  "sees.eyebrow": "Yang dilihat agen", "sees.title": "Yang diterima agen saat ia melihat.",
  "sees.lede": "Output asli dari uji coba di Windows 11: reel 8 detik berisi klip uji, judul, caption dari file .srt, dan satu lagu dari library. Gambarnya dikirim ke model, begitu juga teksnya.",
  "sees.tab.sheet": "Contact sheet", "sees.tab.frame": "Satu frame",
  "cap.eyebrow": "Caption", "cap.title": "Caption dari file, track subtitle, atau suara.",
  "cap.p1": "extract_captions membaca file .srt atau .vtt, atau stream subtitle pertama di dalam video. Kalau keduanya tidak ada dan Whisper terpasang di komputer Anda, audionya ditranskrip secara lokal. Setiap kata tetap mendapat waktunya sendiri.",
  "cap.p2": "Pratinjau di samping digambar oleh renderer yang sama dengan studio dan ekspor. Pilih gayanya.",
  "music.eyebrow": "Library musik", "music.title": "Enam lagu yang bebas dipakai di mana saja.",
  "music.lede": "Semuanya disintesis dari kode, jadi tidak ada sampel yang perlu dilisensikan. Dirilis dengan CC0. Tekan play dan browser Anda menyusun lagunya saat itu juga, dengan kode yang sama yang dijalankan server.",
  building: "menyusun…",
  "tools.eyebrow": "Tool", "tools.title": "28 tool, dinamai seperti cara editor bicara.",
  "tools.lede": "Agen membaca nama dan deskripsi ini saat memutuskan apa yang dipanggil. Silakan cari.",
  "tools.search": "Cari tool", "tools.none": "Tidak ada tool yang cocok.",
  "exp.eyebrow": "Ekspor", "exp.title": "Selesaikan di editor yang sudah Anda pakai.",
  "exp.lede": "Setiap ekspor menulis NOTES.txt berisi apa saja yang tidak ikut terbawa, jadi tidak ada yang hilang diam-diam. Ini ringkasannya.",
  "exp.h.format": "Format", "exp.h.opens": "Dibuka di", "exp.h.keeps": "Ikut terbawa", "exp.h.drops": "Tertinggal",
  "exp.mp4.o": "Di mana saja", "exp.mp4.k": "Semua yang Anda lihat di studio, H.264 dengan audio AAC yang sudah di-mix",
  "exp.fcp.k": "Potongan, trim, track, judul, posisi, timing, level audio", "exp.fcp.d": "Animasi teks, grading, bentuk, dan fill",
  "exp.xml.k": "Potongan video dan audio, trim, level; caption sebagai .srt", "exp.xml.d": "Judul, bentuk, dan fill (FCP7 XML tidak bisa mendeskripsikan judul Premiere)",
  "exp.cc.o": "CapCut desktop (eksperimental)", "exp.cc.k": "Media, teks, dan audio dalam format draft yang dipakai komunitas", "exp.cc.d": "Bentuk, fill, keyframe. Versi baru mengenkripsi draft dan bisa menolak folder ini",
  "exp.rem.o": "Remotion (React)", "exp.rem.k": "Seluruh timeline sebagai JSON plus komposisi Reel.tsx, media ikut disalin", "exp.rem.d": "Lisensi Remotion berlaku untuk perusahaan di atas tiga orang",
  "exp.otio.o": "Adapter OpenTimelineIO", "exp.otio.k": "Track dan klip; teks, bentuk, dan caption sebagai generator dengan parameter lengkap", "exp.otio.d": "Klip yang bertumpuk di satu track",
  "exp.sub.o": "YouTube, pemutar video, editor apa pun", "exp.sub.k": "Teks dan timing caption", "exp.sub.d": "Gaya caption",
  "led.eyebrow": "Ledger edit · Solana devnet", "led.title": "Bukti yang menunjuk potongan yang tepat.",
  "led.p1": "Opsional. Dengan keypair devnet, tool ledger menulis hash timeline ke akun reel, lalu menyegel SHA-256 file hasil ekspor terhadap head tersebut. Segel hanya bisa ditulis untuk head terbaru, jadi selalu menunjuk potongan yang menghasilkan file itu.",
  "led.p2": "Setiap segel juga mencatat apakah editannya dibuat agen, manusia, atau keduanya, dan apakah media atau suaranya sintetis. Siapa pun bisa memeriksa file dengan meng-hash-nya. Coba dengan file apa saja; tidak ada yang diunggah.",
  "led.program": "Program", "led.network": "Jaringan", "led.ix": "Instruksi",
  "led.drop": "Taruh video di sini untuk memeriksa segelnya", "led.drop.sub": "File di-hash di browser Anda. Hanya hash-nya yang dicek ke devnet.",
  "led.sample": "Atau periksa ekspor demo yang sudah disegel",
  "v.hashing": "Menghitung SHA-256…", "v.looking": "Mencari segel di devnet…", "v.sealed": "Tersegel di devnet.", "v.none": "Belum ada segel untuk file ini.", "v.err": "Gagal menghubungi devnet:",
  "v.file": "file", "v.seal": "segel", "v.reel": "reel", "v.timeline": "timeline", "v.version": "versi", "v.flags": "penanda", "v.when": "disegel",
  "ins.eyebrow": "Pasang", "ins.title": "Lima menit sampai potongan pertama.",
  "ins.lede": "Anda perlu Node 20 atau lebih baru, ffmpeg di PATH, dan Chrome atau Edge untuk merender. Build sekali, lalu arahkan agen Anda ke server.",
  "ins.other": "Klien lain",
  "ins.then": "Lalu minta sesuatu seperti <q>Buat teaser vertikal 20 detik dari intro.mp4 dengan caption tebal dan musik tenang, cek dulu sebelum ekspor.</q> Studio terbuka di <code>127.0.0.1:4321</code> pada editan pertama.",
  "ins.env": "Variabel lingkungan",
  "env.port": "Port studio. Bawaan 4321; kalau terpakai, port kosong berikutnya dipakai.", "env.home": "Lokasi proyek, musik, dan hasil ekspor. Bawaan ~/.cutloupe.",
  "env.noopen": "Isi 1 supaya studio tidak otomatis terbuka di browser.", "env.chrome": "Path ke Chrome atau Edge, kalau tidak berada di lokasi biasa.",
  "env.keypair": "File keypair devnet. Menyalakan ledger edit.", "env.whisper": "Nama model Whisper, atau file ggml untuk whisper.cpp.",
  "lim.eyebrow": "Batasan", "lim.title": "Yang belum bisa dilakukan.",
  "lim.1": "Cutloupe tidak membuat footage. Ia mengedit dan menganimasikan materi dari Anda, lalu menambahkan judul, bentuk, caption, dan musik.",
  "lim.2": "Speech-to-text butuh Whisper terpasang di komputer. Tanpanya, caption diambil dari file atau track subtitle.",
  "lim.3": "Ekspor FCPXML, Premiere, dan CapCut lolos uji struktur, tetapi di rilis ini belum kami buka langsung di Resolve, Premiere, atau CapCut.",
  "lim.4": "Ekspor MP4 merender setiap frame lewat Chrome headless. Di mesin uji kami, reel 8 detik 1080p butuh sekitar dua setengah menit.",
  "lim.5": "Paket npm belum diterbitkan, jadi untuk sekarang pasang dari GitHub.",
  "faq.eyebrow": "Pertanyaan", "faq.title": "Yang biasanya ditanyakan duluan.",
  "faq.1.q": "Apa bedanya dengan menyuruh agen menulis perintah ffmpeg?", "faq.1.a": "Perintah ffmpeg adalah tebakan yang tidak bisa dicek agen. Di sini agen bekerja di timeline yang bisa dibaca ulang, melihat frame hasil render, dan Anda bisa ikut campur kapan saja tanpa merusak rencananya.",
  "faq.2.q": "Bisakah saya mengedit saat agen sedang bekerja?", "faq.2.a": "Bisa. Geser, trim, atau hapus di studio. Editan Anda masuk ke log operasi yang sama, agen melihatnya di panggilan berikutnya, dan undo berlaku untuk Anda berdua.",
  "faq.3.q": "Apakah footage saya keluar dari komputer?", "faq.3.a": "Tidak. Server, studio, dan renderer semuanya jalan di 127.0.0.1. Satu-satunya panggilan jaringan adalah ledger opsional, dan yang dikirim hanya hash, bukan media.",
  "faq.4.q": "Kenapa Solana, dan apakah saya membutuhkannya?", "faq.4.a": "Tidak wajib. Ledger ini untuk orang yang menerbitkan video hasil edit atau dibantu AI dan ingin catatan publik yang murah tentang potongan mana menghasilkan file mana. Saat ini berjalan di devnet.",
  "faq.5.q": "Berapa biayanya?", "faq.5.a": "Gratis. Cutloupe berlisensi MIT, dan library musiknya CC0.",
  "foot.line": "Lisensi MIT. Dibangun di atas ffmpeg, Chrome headless, dan Model Context Protocol.", "foot.studio": "Demo studio", "foot.devnet": "Bukti devnet",
  "group.project": "Proyek", "group.media": "Media", "group.graphics": "Grafis dan gerak", "group.edit": "Edit", "group.sound": "Suara dan caption", "group.ship": "Lihat dan kirim",
};

const es: Dict = {
  skip: "Ir al contenido",
  "nav.loop": "Cómo funciona", "nav.sees": "Qué ve", "nav.tools": "Herramientas", "nav.exports": "Exportar", "nav.ledger": "Registro", "nav.install": "Instalar",
  "lang.label": "Idioma", copy: "Copiar", copied: "Copiado",
  "hero.kicker": "Servidor MCP para Claude Code, Antigravity, Codex y otros agentes. Funciona en Windows, macOS y Linux.",
  "hero.title": "Un editor de video que tu agente puede <em>ver</em>.",
  "hero.lede": "Cutloupe le da a tu agente una línea de tiempo de verdad. Corta, pone títulos, subtítulos y música mientras tú ves cada edición aparecer en el estudio. Antes de dar el trabajo por terminado, renderiza los fotogramas reales y los revisa.",
  "hero.demo": "Abrir la demo del estudio", "hero.watch": "Ver el recorrido", "hero.pop": "Pantalla completa", "hero.start": "Iniciar la sesión de demo",
  "hero.caption": "Es el estudio real, en tu navegador, manejado por un agente con guion que usa las mismas operaciones que el servidor MCP. El ámbar marca las ediciones del agente. Arrastra un clip y la sesión sigue adelante.",
  "loop.eyebrow": "Cómo funciona", "loop.title": "Editar, mostrar, mirar, corregir.",
  "loop.lede": "Casi todas las herramientas de video para agentes escriben un archivo y esperan que salga bien. Cutloupe cierra el ciclo, así el agente encuentra sus propios errores antes de que tengas que señalarlos.",
  "loop.s1.t": "El agente edita", "loop.s1.p": "Cada llamada, como add_text o split_clip, se convierte en una operación sobre una sola línea de tiempo compartida. Los lotes se aplican completos o no se aplican, y todo se puede deshacer.",
  "loop.s2.t": "Tú lo ves llegar", "loop.s2.p": "El estudio se redibuja en el siguiente fotograma. Los clips que tocó el agente se iluminan en ámbar con una nota de lo que cambió. Tus ediciones se ven en azul, y el agente también las ve.",
  "loop.s3.t": "El agente mira", "loop.s3.p": "La herramienta look renderiza fotogramas con el mismo compositor que usa la exportación MP4 y devuelve una imagen y una lista de todo lo que hay en pantalla. Tú ves dónde miró.",
  "loop.s4.t": "Corrige lo que encuentra", "loop.s4.p": "Si un subtítulo queda encima del título, el agente lo nota, lo mueve y vuelve a revisar. La demo de arriba comete ese error a propósito en el segundo 2,5.",
  "walk.eyebrow": "Recorrido", "walk.title": "De principio a fin.",
  "walk.lede": "Grabado en Chrome sin interfaz desde el estudio real y esta página, con música de la biblioteca de Cutloupe. No hay narración; los subtítulos van dentro de la imagen.",
  "sees.eyebrow": "Qué ve", "sees.title": "Lo que recibe el agente cuando mira.",
  "sees.lede": "Salida real de una prueba en Windows 11: un video de 8 segundos con un clip de prueba, un título, subtítulos desde un .srt y una pista de la biblioteca. La imagen va al modelo, y el texto también.",
  "sees.tab.sheet": "Hoja de contactos", "sees.tab.frame": "Un fotograma",
  "cap.eyebrow": "Subtítulos", "cap.title": "Subtítulos desde un archivo, una pista o la voz.",
  "cap.p1": "extract_captions lee un archivo .srt o .vtt, o la primera pista de subtítulos dentro del video. Si no hay ninguno y tienes Whisper instalado, transcribe el audio en tu equipo. En todos los casos cada palabra recibe su propio tiempo.",
  "cap.p2": "La vista previa de al lado la dibuja el mismo renderizador que usan el estudio y la exportación. Elige un estilo.",
  "music.eyebrow": "Biblioteca musical", "music.title": "Seis pistas que puedes usar donde quieras.",
  "music.lede": "Cada una se sintetiza con código, así que no hay ninguna muestra que licenciar. Se publican bajo CC0. Dale a reproducir y tu navegador arma la pista en ese momento, con el mismo código que corre el servidor.",
  building: "generando…",
  "tools.eyebrow": "Herramientas", "tools.title": "28 herramientas con los nombres que usa un editor.",
  "tools.lede": "El agente lee estos nombres y descripciones para decidir qué llamar. Búscalas.",
  "tools.search": "Buscar herramientas", "tools.none": "Ninguna herramienta coincide.",
  "exp.eyebrow": "Exportar", "exp.title": "Termínalo en el editor que ya usas.",
  "exp.lede": "Cada exportación escribe un NOTES.txt con lo que no se pudo llevar, para que nada desaparezca sin aviso. Este es el resumen.",
  "exp.h.format": "Formato", "exp.h.opens": "Se abre en", "exp.h.keeps": "Se conserva", "exp.h.drops": "Se queda fuera",
  "exp.mp4.o": "Cualquier lugar", "exp.mp4.k": "Todo lo que ves en el estudio, en H.264 con audio AAC mezclado",
  "exp.fcp.k": "Cortes, recortes, pistas, títulos, posiciones, tiempos, niveles de audio", "exp.fcp.d": "Animación de texto, etalonaje, formas y rellenos",
  "exp.xml.k": "Cortes de video y audio, recortes y niveles; subtítulos como .srt", "exp.xml.d": "Títulos, formas y rellenos (FCP7 XML no puede describir títulos de Premiere)",
  "exp.cc.o": "CapCut de escritorio (experimental)", "exp.cc.k": "Medios, texto y audio en el formato de borrador que usa la comunidad", "exp.cc.d": "Formas, rellenos, fotogramas clave. Las versiones nuevas cifran los borradores y pueden rechazar la carpeta",
  "exp.rem.o": "Remotion (React)", "exp.rem.k": "Toda la línea de tiempo en JSON más una composición Reel.tsx, con los medios copiados", "exp.rem.d": "La licencia de Remotion aplica a empresas de más de tres personas",
  "exp.otio.o": "Adaptadores de OpenTimelineIO", "exp.otio.k": "Pistas y clips; texto, formas y subtítulos como generadores con todos sus parámetros", "exp.otio.d": "Clips superpuestos en una misma pista",
  "exp.sub.o": "YouTube, reproductores, cualquier editor", "exp.sub.k": "Texto y tiempos de los subtítulos", "exp.sub.d": "Estilo de los subtítulos",
  "led.eyebrow": "Registro de edición · Solana devnet", "led.title": "Un comprobante que apunta al corte exacto.",
  "led.p1": "Opcional. Con una clave de devnet, la herramienta ledger guarda el hash de la línea de tiempo en una cuenta de reel y luego sella el SHA-256 del archivo exportado contra esa cabeza. Solo se puede sellar la cabeza actual, así que el sello siempre nombra el corte que produjo el archivo.",
  "led.p2": "Cada sello indica además si editó un agente, una persona o ambos, y si los medios o la voz son sintéticos. Cualquiera puede comprobar un archivo calculando su hash. Pruébalo con cualquier archivo: no se sube nada.",
  "led.program": "Programa", "led.network": "Red", "led.ix": "Instrucciones",
  "led.drop": "Suelta un video aquí para comprobar su sello", "led.drop.sub": "El hash se calcula en tu navegador. Solo el hash se consulta en devnet.",
  "led.sample": "O comprueba la exportación de demo sellada",
  "v.hashing": "Calculando SHA-256…", "v.looking": "Buscando el sello en devnet…", "v.sealed": "Sellado en devnet.", "v.none": "Este archivo no tiene sello.", "v.err": "No se pudo consultar devnet:",
  "v.file": "archivo", "v.seal": "sello", "v.reel": "reel", "v.timeline": "línea de tiempo", "v.version": "versión", "v.flags": "marcas", "v.when": "sellado",
  "ins.eyebrow": "Instalar", "ins.title": "Cinco minutos hasta el primer corte.",
  "ins.lede": "Necesitas Node 20 o superior, ffmpeg en el PATH y Chrome o Edge para renderizar. Compila una vez y apunta tu agente al servidor.",
  "ins.other": "Otros clientes",
  "ins.then": "Luego pide algo como <q>Haz un teaser vertical de 20 segundos con intro.mp4, subtítulos en negrita y música tranquila, y revísalo antes de exportar.</q> El estudio se abre en <code>127.0.0.1:4321</code> con la primera edición.",
  "ins.env": "Variables de entorno",
  "env.port": "Puerto del estudio. Por defecto 4321; si está ocupado se usa el siguiente libre.", "env.home": "Dónde van los proyectos, la música y las exportaciones. Por defecto ~/.cutloupe.",
  "env.noopen": "Ponlo en 1 para que el estudio no se abra en el navegador.", "env.chrome": "Ruta a Chrome o Edge, si no están en el lugar habitual.",
  "env.keypair": "Un archivo de clave de devnet. Activa el registro de edición.", "env.whisper": "Nombre del modelo de Whisper, o un archivo ggml para whisper.cpp.",
  "lim.eyebrow": "Límites", "lim.title": "Lo que todavía no hace.",
  "lim.1": "No genera metraje. Edita y anima lo que le das, y añade títulos, formas, subtítulos y música.",
  "lim.2": "La transcripción necesita Whisper instalado en tu equipo. Sin él, los subtítulos salen de archivos o pistas de subtítulos.",
  "lim.3": "Las exportaciones FCPXML, Premiere y CapCut pasan pruebas de estructura, pero en esta versión aún no las hemos abierto en Resolve, Premiere ni CapCut.",
  "lim.4": "La exportación MP4 renderiza cada fotograma con Chrome sin interfaz. En nuestra máquina de prueba, un video de 8 segundos en 1080p tardó unos dos minutos y medio.",
  "lim.5": "El paquete de npm aún no está publicado, así que por ahora instala desde GitHub.",
  "faq.eyebrow": "Preguntas", "faq.title": "Lo primero que pregunta la gente.",
  "faq.1.q": "¿En qué se diferencia de pedirle al agente un comando de ffmpeg?", "faq.1.a": "Un comando de ffmpeg es una apuesta que el agente no puede verificar. Aquí trabaja sobre una línea de tiempo que puede volver a leer, ve fotogramas renderizados, y tú puedes intervenir en cualquier momento sin romper su plan.",
  "faq.2.q": "¿Puedo editar mientras el agente trabaja?", "faq.2.a": "Sí. Arrastra, recorta o borra en el estudio. Tus cambios entran en el mismo registro de operaciones, el agente los ve en su siguiente llamada y deshacer funciona para los dos.",
  "faq.3.q": "¿Mi material sale de mi equipo?", "faq.3.a": "No. El servidor, el estudio y el renderizador corren en 127.0.0.1. La única llamada de red es el registro opcional, que envía hashes, nunca medios.",
  "faq.4.q": "¿Por qué Solana, y lo necesito?", "faq.4.a": "No lo necesitas. El registro es para quien publica video editado o asistido por IA y quiere una constancia pública y barata de qué corte produjo qué archivo. Hoy funciona en devnet.",
  "faq.5.q": "¿Cuánto cuesta?", "faq.5.a": "Nada. Cutloupe tiene licencia MIT y la biblioteca musical es CC0.",
  "foot.line": "Licencia MIT. Hecho con ffmpeg, Chrome sin interfaz y el Model Context Protocol.", "foot.studio": "Demo del estudio", "foot.devnet": "Prueba en devnet",
  "group.project": "Proyecto", "group.media": "Medios", "group.graphics": "Gráficos y movimiento", "group.edit": "Edición", "group.sound": "Sonido y subtítulos", "group.ship": "Ver y entregar",
};

const ja: Dict = {
  skip: "本文へ移動",
  "nav.loop": "仕組み", "nav.sees": "エージェントの視点", "nav.tools": "ツール", "nav.exports": "書き出し", "nav.ledger": "台帳", "nav.install": "導入",
  "lang.label": "言語", copy: "コピー", copied: "コピーしました",
  "hero.kicker": "Claude Code、Antigravity、Codex などのエージェント向け MCP サーバー。Windows、macOS、Linux で動作します。",
  "hero.title": "エージェントが<em>見て</em>確かめる動画エディター。",
  "hero.lede": "Cutloupe はエージェントに本物のタイムラインを渡します。カット、タイトル、字幕、音楽をエージェントが加え、その一つひとつがスタジオに反映される様子をあなたが見られます。完成と言う前に、エージェントは実際のフレームを書き出して自分で確認します。",
  "hero.demo": "スタジオのデモを開く", "hero.watch": "ウォークスルーを見る", "hero.pop": "全画面で開く", "hero.start": "デモセッションを開始",
  "hero.caption": "これはブラウザで動く本物のスタジオです。MCP サーバーと同じ操作を使う、台本付きのエージェントが編集しています。琥珀色はエージェントの編集。クリップを自分で動かしても、セッションはそのまま続きます。",
  "loop.eyebrow": "仕組み", "loop.title": "編集して、見せて、確かめて、直す。",
  "loop.lede": "エージェント向けの動画ツールの多くは、ファイルを書き出して終わりです。Cutloupe はその輪を閉じるので、あなたが指摘する前にエージェントが自分の誤りに気づきます。",
  "loop.s1.t": "エージェントが編集する", "loop.s1.p": "add_text や split_clip などの呼び出しは、共有のタイムラインへの操作になります。まとめた操作はすべて適用されるか、まったく適用されないかのどちらかで、どの手順も取り消せます。",
  "loop.s2.t": "あなたはそれを見る", "loop.s2.p": "スタジオは次のフレームで描き直されます。エージェントが触れたクリップは琥珀色に光り、何が変わったかが表示されます。あなたの編集は青で示され、エージェントにも伝わります。",
  "loop.s3.t": "エージェントが確かめる", "loop.s3.p": "look ツールは MP4 書き出しと同じ合成処理でフレームを描き、画像と画面上の要素の一覧を返します。どこを確認したかはあなたにも見えます。",
  "loop.s4.t": "見つけた問題を直す", "loop.s4.p": "サブタイトルがタイトルに重なっていれば、エージェントはそれに気づいて位置を動かし、もう一度確認します。上のデモでは 2.5 秒の地点でわざとこの誤りを起こしています。",
  "walk.eyebrow": "ウォークスルー", "walk.title": "最初から書き出しまで。",
  "walk.lede": "本物のスタジオとこのページをヘッドレス Chrome で録画し、Cutloupe のライブラリ曲を付けました。ナレーションはなく、字幕は映像に焼き込んであります。",
  "sees.eyebrow": "エージェントの視点", "sees.title": "確認するとき、エージェントが受け取るもの。",
  "sees.lede": "Windows 11 でのテスト実行で得た実際の出力です。テスト用クリップ、タイトル、.srt からの字幕、ライブラリ曲を含む 8 秒のリール。画像もテキストもモデルに渡されます。",
  "sees.tab.sheet": "コンタクトシート", "sees.tab.frame": "単一フレーム",
  "cap.eyebrow": "字幕", "cap.title": "字幕はファイル、字幕トラック、または音声から。",
  "cap.p1": "extract_captions は .srt や .vtt ファイル、または動画内の最初の字幕ストリームを読み込みます。どちらもなく、Whisper がインストールされていれば、音声をローカルで文字起こしします。いずれの場合も単語ごとにタイミングが付きます。",
  "cap.p2": "隣のプレビューは、スタジオや書き出しと同じレンダラーで描いています。スタイルを選んでください。",
  "music.eyebrow": "音楽ライブラリ", "music.title": "どこでも使える 6 曲。",
  "music.lede": "すべてコードから合成しているので、ライセンスが必要なサンプルはありません。CC0 で公開しています。再生を押すと、サーバーと同じコードでブラウザがその場で曲を組み立てます。",
  building: "生成中…",
  "tools.eyebrow": "ツール", "tools.title": "編集者の言葉で名付けた 28 のツール。",
  "tools.lede": "エージェントは呼び出すツールを決めるとき、この名前と説明を読みます。検索してみてください。",
  "tools.search": "ツールを検索", "tools.none": "該当するツールはありません。",
  "exp.eyebrow": "書き出し", "exp.title": "仕上げは、いつものエディターで。",
  "exp.lede": "書き出しのたびに、引き継げなかった内容を NOTES.txt に記録します。黙って消えるものはありません。概要は次のとおりです。",
  "exp.h.format": "形式", "exp.h.opens": "開けるアプリ", "exp.h.keeps": "引き継がれるもの", "exp.h.drops": "残らないもの",
  "exp.mp4.o": "どこでも", "exp.mp4.k": "スタジオで見えるすべて。H.264 とミックス済みの AAC 音声",
  "exp.fcp.k": "カット、トリム、トラック、タイトル、位置、タイミング、音量", "exp.fcp.d": "テキストのアニメーション、グレーディング、図形、塗り",
  "exp.xml.k": "映像と音声のカット、トリム、音量。字幕は .srt", "exp.xml.d": "タイトル、図形、塗り（FCP7 XML では Premiere のタイトルを表現できません）",
  "exp.cc.o": "CapCut デスクトップ（実験的）", "exp.cc.k": "コミュニティで使われている下書き形式でのメディア、テキスト、音声", "exp.cc.d": "図形、塗り、キーフレーム。新しい版は下書きを暗号化しており、フォルダーを拒否する場合があります",
  "exp.rem.o": "Remotion（React）", "exp.rem.k": "タイムライン全体の JSON と Reel.tsx のコンポジション。メディアもコピーされます", "exp.rem.d": "4 人以上の企業には Remotion のライセンスが必要です",
  "exp.otio.o": "OpenTimelineIO のアダプター", "exp.otio.k": "トラックとクリップ。テキスト、図形、字幕はパラメーター付きのジェネレーターとして", "exp.otio.d": "同じトラック上で重なったクリップ",
  "exp.sub.o": "YouTube、各種プレーヤー、あらゆるエディター", "exp.sub.k": "字幕のテキストとタイミング", "exp.sub.d": "字幕のスタイル",
  "led.eyebrow": "編集台帳 · Solana devnet", "led.title": "どのカットから生まれたかを示す証明。",
  "led.p1": "任意の機能です。devnet のキーペアを設定すると、ledger ツールがタイムラインのハッシュをリールのアカウントに記録し、書き出したファイルの SHA-256 をその時点のヘッドに対して封印します。封印できるのは最新のヘッドだけなので、封印は必ずそのファイルを生んだカットを指します。",
  "led.p2": "封印には、編集したのがエージェントか人か両方か、メディアや声が合成かどうかも記録されます。ファイルのハッシュを取れば誰でも確認できます。どんなファイルでも試せます。アップロードはされません。",
  "led.program": "プログラム", "led.network": "ネットワーク", "led.ix": "命令",
  "led.drop": "動画をここにドロップして封印を確認", "led.drop.sub": "ハッシュはブラウザ内で計算され、devnet に問い合わせるのはハッシュだけです。",
  "led.sample": "または封印済みのデモ書き出しを確認",
  "v.hashing": "SHA-256 を計算中…", "v.looking": "devnet で封印を検索中…", "v.sealed": "devnet で封印されています。", "v.none": "このファイルの封印はありません。", "v.err": "devnet に接続できませんでした：",
  "v.file": "ファイル", "v.seal": "封印", "v.reel": "リール", "v.timeline": "タイムライン", "v.version": "版", "v.flags": "フラグ", "v.when": "封印日時",
  "ins.eyebrow": "導入", "ins.title": "最初のカットまで 5 分。",
  "ins.lede": "Node 20 以降、PATH 上の ffmpeg、レンダリング用の Chrome か Edge が必要です。一度ビルドしたら、エージェントにサーバーを登録します。",
  "ins.other": "その他のクライアント",
  "ins.then": "あとは<q>intro.mp4 から 20 秒の縦型ティーザーを作って。字幕は太字、音楽は落ち着いたもので。書き出す前に確認して。</q>のように頼むだけです。最初の編集で <code>127.0.0.1:4321</code> にスタジオが開きます。",
  "ins.env": "環境変数",
  "env.port": "スタジオのポート。既定は 4321 で、使用中なら次の空きポートを使います。", "env.home": "プロジェクト、音楽、書き出しの保存先。既定は ~/.cutloupe。",
  "env.noopen": "1 にするとブラウザでスタジオを自動で開きません。", "env.chrome": "Chrome または Edge が通常の場所にない場合のパス。",
  "env.keypair": "devnet のキーペアファイル。編集台帳が有効になります。", "env.whisper": "Whisper のモデル名、または whisper.cpp 用の ggml ファイル。",
  "lim.eyebrow": "制限", "lim.title": "まだできないこと。",
  "lim.1": "映像そのものは生成しません。渡された素材を編集・アニメーションし、タイトル、図形、字幕、音楽を加えます。",
  "lim.2": "音声の文字起こしには、ローカルに Whisper が必要です。ない場合、字幕は字幕ファイルか字幕トラックから取ります。",
  "lim.3": "FCPXML、Premiere、CapCut の書き出しは構造テストに合格していますが、このリリースではまだ Resolve、Premiere、CapCut で実際に開いて確認していません。",
  "lim.4": "MP4 の書き出しはヘッドレス Chrome で全フレームを描きます。テスト環境では 8 秒の 1080p リールに約 2 分半かかりました。",
  "lim.5": "npm パッケージはまだ公開していないため、当面は GitHub から導入してください。",
  "faq.eyebrow": "よくある質問", "faq.title": "最初によく聞かれること。",
  "faq.1.q": "エージェントに ffmpeg コマンドを書かせるのと何が違うのですか？", "faq.1.a": "ffmpeg コマンドは、エージェントが確かめられない当て推量です。ここではエージェントが読み返せるタイムライン上で作業し、描画されたフレームを見ます。あなたはいつでも割り込めて、それで計画が崩れることもありません。",
  "faq.2.q": "エージェントの作業中に自分でも編集できますか？", "faq.2.a": "できます。スタジオでドラッグ、トリム、削除してください。あなたの編集は同じ操作ログに入り、エージェントは次の呼び出しでそれを把握します。取り消しは両者の操作に効きます。",
  "faq.3.q": "素材が自分のマシンの外に出ることはありますか？", "faq.3.a": "ありません。サーバー、スタジオ、レンダラーはすべて 127.0.0.1 で動きます。外部への通信は任意の台帳だけで、送るのはハッシュのみ、メディアは送りません。",
  "faq.4.q": "なぜ Solana なのですか？ 必要ですか？", "faq.4.a": "必須ではありません。編集した動画や AI の手を借りた動画を公開する人が、どのカットからどのファイルが生まれたかを安価に公開記録できるようにするためのものです。現在は devnet で動いています。",
  "faq.5.q": "費用はかかりますか？", "faq.5.a": "かかりません。Cutloupe は MIT ライセンスで、音楽ライブラリは CC0 です。",
  "foot.line": "MIT ライセンス。ffmpeg、ヘッドレス Chrome、Model Context Protocol を使って作られています。", "foot.studio": "スタジオのデモ", "foot.devnet": "devnet での証明",
  "group.project": "プロジェクト", "group.media": "メディア", "group.graphics": "グラフィックと動き", "group.edit": "編集", "group.sound": "音と字幕", "group.ship": "確認と書き出し",
};

const enExtra: Dict = {
  copied: "Copied", building: "building…", "tools.none": "No tool matches.",
  "v.hashing": "Hashing with SHA-256…", "v.looking": "Looking for a seal on devnet…", "v.sealed": "Sealed on devnet.", "v.none": "No seal for this file.", "v.err": "Could not reach devnet:",
  "v.file": "file", "v.seal": "seal", "v.reel": "reel", "v.timeline": "timeline", "v.version": "version", "v.flags": "flags", "v.when": "sealed",
  "group.project": "Project", "group.media": "Media", "group.graphics": "Graphics and motion", "group.edit": "Edit", "group.sound": "Sound and captions", "group.ship": "See and ship",
};

const DICTS: Record<Exclude<Lang, "en">, Dict> = { id, es, ja };
const en: Dict = { ...enExtra };
let current: Lang = "en";
const listeners: ((l: Lang) => void)[] = [];

/** Read the English text out of the page once, so switching back restores it. */
function captureEnglish() {
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => { en[el.dataset.i18n!] ??= el.textContent!.trim(); });
  document.querySelectorAll<HTMLElement>("[data-i18n-html]").forEach((el) => { en[el.dataset.i18nHtml!] ??= el.innerHTML.trim(); });
}

export function t(key: string): string {
  return (current !== "en" && DICTS[current][key]) || en[key] || key;
}

export function lang(): Lang { return current; }
export function onLang(fn: (l: Lang) => void) { listeners.push(fn); }

export function setLang(l: Lang) {
  current = l;
  document.documentElement.lang = l;
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n!); });
  document.querySelectorAll<HTMLElement>("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml!); });
  try { localStorage.setItem("cutloupe.lang", l); } catch { /* private mode */ }
  listeners.forEach((fn) => fn(l));
}

export function initLang(select: HTMLSelectElement) {
  captureEnglish();
  const known = (v: string | null): v is Lang => !!v && ["en", "id", "es", "ja"].includes(v);
  const fromUrl = new URLSearchParams(location.search).get("lang");
  let saved: string | null = null;
  try { saved = localStorage.getItem("cutloupe.lang"); } catch { /* ignore */ }
  const browser = navigator.language.slice(0, 2);
  const start: Lang = known(fromUrl) ? fromUrl : known(saved) ? saved : "en";
  select.value = start;
  if (start !== "en") setLang(start);
  else current = "en";
  select.addEventListener("change", () => setLang(select.value as Lang));
  return { browser };
}
