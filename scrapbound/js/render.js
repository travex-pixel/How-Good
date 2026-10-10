// SCRAPBOUND renderer: procedural cartoon art on a 2D canvas.
// Reads battle state from sim.js and turns sim events into particles.
(function () {
  const SB = (globalThis.SB = globalThis.SB || {});
  const { W, H } = SB.WORLD;
  const TAU = Math.PI * 2;
  const INK = '#1d1a24';

  // ------------------------------------------------------------ drawing kit
  function P(ctx) {
    // tiny helper bound to ctx for compact shape code
    const k = {
      fill(c) { ctx.fillStyle = c; ctx.fill(); return k; },
      stroke(w = 2.5, c = INK) { ctx.lineWidth = w; ctx.strokeStyle = c; ctx.stroke(); return k; },
      both(c, w = 2.5) { k.fill(c); k.stroke(w); return k; },
      circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, TAU); return k; },
      ell(x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); return k; },
      rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); return k; },
      poly(pts) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); return k; },
      line(x1, y1, x2, y2, w = 3, c = INK) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineWidth = w; ctx.strokeStyle = c; ctx.lineCap = 'round'; ctx.stroke(); return k; },
    };
    return k;
  }

  function eyes(ctx, x, y, gap, r, look = 1, color = '#fff', pupil = INK) {
    const p = P(ctx);
    p.circle(x - gap, y, r).both(color, 1.5);
    p.circle(x + gap, y, r).both(color, 1.5);
    p.circle(x - gap + look * r * 0.35, y, r * 0.5).fill(pupil);
    p.circle(x + gap + look * r * 0.35, y, r * 0.5).fill(pupil);
  }

  // Each body is drawn around (0,0) facing right, sized for radius r.
  // c(color) returns white while the unit is flashing from a hit.
  const BODIES = {
    knight(ctx, r, a, c) {
      const p = P(ctx);
      const swing = a.atk > 0 ? -1.9 + (1 - a.atk) * 2.6 : a.special > 0 ? a.special * TAU * 2 : -0.5;
      // sword behind body
      ctx.save(); ctx.translate(r * 0.3, -r * 0.1); ctx.rotate(swing);
      p.rr(-3, -r * 2.5, 9, r * 2.3, 3).both(c('#dfe7f2'));
      p.rr(-9, -r * 0.3, 21, 6, 2).both(c('#e8c35a'));
      p.rr(-1, -r * 0.1, 5, r * 0.5, 2).both(c('#6b4a2f'));
      ctx.restore();
      p.rr(-r * 0.55, r * 0.35, r * 0.4, r * 0.55, 3).both(c('#55606e'));
      p.rr(r * 0.15, r * 0.35, r * 0.4, r * 0.55, 3).both(c('#55606e'));
      p.rr(-r * 0.75, -r * 0.35, r * 1.5, r * 0.95, r * 0.35).both(c('#a9c1e6'));
      p.line(-r * 0.2, -r * 0.2, -r * 0.2, r * 0.45, 2, '#7d8fae');
      p.circle(0, -r * 0.7, r * 0.55).both(c('#c7d6ee'));
      p.rr(-r * 0.05, -r * 0.82, r * 0.55, r * 0.14, 2).fill(INK);
      p.poly([-r * 0.1, -r * 1.2, r * 0.25, -r * 1.75, -r * 0.6, -r * 1.35]).both(c('#d9534f'));
    },
    goblin(ctx, r, a, c) {
      const p = P(ctx);
      p.rr(-r * 1.15, -r * 0.6, r * 0.7, r * 1.0, 4).both(c('#8a5a3b'));
      p.rr(-r * 1.25, -r * 0.95, r * 0.42, r * 0.55, 3).both(c('#d9534f'));
      p.rr(-r * 0.8, -r * 0.95, r * 0.42, r * 0.55, 3).both(c('#d9534f'));
      p.line(-r * 1.05, -r * 0.95, -r * 1.2, -r * 1.35, 2, '#3b2b20');
      p.circle(-r * 1.2, -r * 1.4, 2.5 + Math.random() * 2).fill('#ffd84a');
      p.ell(0, r * 0.2, r * 0.7, r * 0.75).both(c('#7fc45a'));
      p.circle(r * 0.1, -r * 0.55, r * 0.62).both(c('#8fd46a'));
      p.poly([-r * 0.4, -r * 0.7, -r * 1.2, -r * 1.05, -r * 0.45, -r * 0.35]).both(c('#8fd46a'));
      p.poly([r * 0.55, -r * 0.75, r * 1.25, -r * 1.15, r * 0.65, -r * 0.4]).both(c('#8fd46a'));
      eyes(ctx, r * 0.25, -r * 0.65, r * 0.22, r * 0.16, 1, '#ffef9a');
      ctx.beginPath(); ctx.arc(r * 0.25, -r * 0.35, r * 0.25, 0.1, Math.PI - 0.1); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
      const t = a.atk;
      p.circle(r * 0.75, r * 0.05 - t * r * 0.6, r * 0.3).both(c('#2b2b33'));
    },
    pit(ctx, r, a, c) {
      const p = P(ctx);
      const punch = a.atk * r * 0.5;
      p.rr(-r * 0.65, r * 0.4, r * 0.45, r * 0.5, 3).both(c('#5a3d2b'));
      p.rr(r * 0.2, r * 0.4, r * 0.45, r * 0.5, 3).both(c('#5a3d2b'));
      p.rr(-r * 0.9, -r * 0.5, r * 1.8, r * 1.05, r * 0.3).both(c('#b07a4f'));
      p.rr(-r * 0.9, -r * 0.05, r * 1.8, r * 0.22, 2).both(c('#4a3524'));
      p.ell(-r * 0.85, -r * 0.45, r * 0.42, r * 0.3).both(c('#8796a3'));
      p.ell(r * 0.85, -r * 0.45, r * 0.42, r * 0.3).both(c('#8796a3'));
      p.circle(r * 0.95 + punch, r * 0.15, r * 0.3).both(c('#e0a77c'));
      p.circle(-r * 0.95, r * 0.15, r * 0.28).both(c('#e0a77c'));
      p.circle(0, -r * 0.75, r * 0.42).both(c('#e0a77c'));
      p.rr(-r * 0.48, -r * 1.25, r * 0.96, r * 0.42, 6).both(c('#6d7a86'));
      p.line(-r * 0.45, -r * 0.6, -r * 0.65, r * 0.1, 4, '#e8c35a');
      p.line(r * 0.45, -r * 0.6, r * 0.65, r * 0.1, 4, '#e8c35a');
      eyes(ctx, r * 0.1, -r * 0.75, r * 0.15, r * 0.1, 1);
    },
    chimp(ctx, r, a, c, t) {
      const p = P(ctx);
      ctx.beginPath(); ctx.moveTo(-r * 0.6, r * 0.3); ctx.bezierCurveTo(-r * 1.6, r * 0.2, -r * 1.4, -r * 1.2, -r * 0.9, -r * 0.9);
      ctx.lineWidth = 4; ctx.strokeStyle = c('#8f5d30'); ctx.stroke();
      p.ell(0, r * 0.15, r * 0.7, r * 0.65).both(c('#c98b4a'));
      const sw = Math.sin(t * 12) * 0.4 + a.atk * 1.2;
      p.line(r * 0.4, -r * 0.1, r * 0.9 + Math.cos(sw) * r * 0.4, r * 0.4 - Math.sin(sw) * r * 0.6, 5, c('#a86f38'));
      p.line(-r * 0.4, -r * 0.1, -r * 0.9, r * 0.6, 5, c('#a86f38'));
      p.circle(0, -r * 0.6, r * 0.55).both(c('#c98b4a'));
      p.ell(r * 0.12, -r * 0.5, r * 0.38, r * 0.32).both(c('#f3d9a8'));
      p.circle(-r * 0.5, -r * 0.65, r * 0.2).both(c('#f3d9a8'));
      eyes(ctx, r * 0.12, -r * 0.7, r * 0.15, r * 0.11, 1);
      p.poly([r * 0.9, r * 0.2, r * 1.3, -r * 0.1, r * 1.2, r * 0.35]).both(c('#f3d27a'));
    },
    boar(ctx, r, a, c) {
      const p = P(ctx);
      for (const lx of [-0.6, -0.2, 0.25, 0.6]) p.rr(r * lx - 3, r * 0.3, 7, r * 0.55, 2).both(c('#5c3a2b'));
      p.ell(0, 0, r * 1.05, r * 0.68).both(c('#8a5a44'));
      for (let i = 0; i < 5; i++) p.poly([-r * 0.6 + i * r * 0.25, -r * 0.55, -r * 0.5 + i * r * 0.25, -r * 0.95, -r * 0.4 + i * r * 0.25, -r * 0.55]).both(c('#3b2a22'), 1.5);
      p.circle(r * 0.75, -r * 0.1, r * 0.48).both(c('#9a6a50'));
      p.ell(r * 1.15, 0, r * 0.22, r * 0.2).both(c('#e8a39a'));
      p.circle(r * 1.12, -r * 0.02, 1.8).fill(INK); p.circle(r * 1.2, -r * 0.02, 1.8).fill(INK);
      p.poly([r * 0.95, r * 0.15, r * 1.35, -r * 0.35, r * 1.05, r * 0.25]).both(c('#f2ead3'), 1.5);
      eyes(ctx, r * 0.8, -r * 0.35, r * 0.12, r * 0.1, 1, '#fff', '#c0392b');
    },
    hound(ctx, r, a, c, t) {
      const p = P(ctx);
      const leg = Math.sin(t * 14) * 3;
      for (const lx of [-0.6, -0.25, 0.25, 0.6]) p.line(r * lx, r * 0.2, r * lx + leg * (lx > 0 ? 1 : -1), r * 0.85, 4, c('#5f6a75'));
      p.line(-r * 0.8, -r * 0.2, -r * 1.25, -r * 0.8, 3, c('#5f6a75'));
      p.circle(-r * 1.25, -r * 0.85, 3).fill('#e07b39');
      p.rr(-r * 0.85, -r * 0.4, r * 1.6, r * 0.75, 5).both(c('#8c97a3'));
      p.circle(-r * 0.5, 0, 2.5).fill(INK); p.circle(r * 0.4, 0, 2.5).fill(INK);
      p.rr(r * 0.35, -r * 0.95, r * 0.8, r * 0.65, 4).both(c('#a3adb8'));
      p.rr(r * 0.95, -r * 0.6 + a.atk * 3, r * 0.4, r * 0.25, 2).both(c('#6b7580'));
      p.circle(r * 0.85, -r * 0.7, r * 0.13).fill('#ff8a3a');
      p.poly([r * 0.4, -r * 0.95, r * 0.45, -r * 1.35, r * 0.65, -r * 0.95]).both(c('#6b7580'), 1.5);
    },
    trickster(ctx, r, a, c) {
      const p = P(ctx);
      p.poly([-r * 0.8, r * 0.9, 0, -r * 0.6, r * 0.8, r * 0.9]).both(c('#6f5aa8'));
      p.circle(0, -r * 0.6, r * 0.45).both(c('#f0c9a0'));
      p.rr(-r * 0.4, -r * 0.75, r * 0.85, r * 0.22, 3).both(c('#2b2140'));
      p.circle(r * 0.05, -r * 0.65, 2).fill('#fff'); p.circle(r * 0.3, -r * 0.65, 2).fill('#fff');
      p.poly([-r * 0.7, -r * 0.85, r * 0.7, -r * 0.85, -r * 0.1, -r * 2.0]).both(c('#4c3c7d'));
      p.line(-r * 0.1, -r * 1.95, -r * 0.6, -r * 2.3, 3, c('#e8c35a'));
      ctx.save(); ctx.translate(r * 0.6, 0); ctx.rotate(-0.2 - a.atk * 0.3);
      p.rr(0, -3, r * 0.8, 6, 2).both(c('#6b4a2f'));
      ctx.beginPath(); ctx.arc(r * 0.65, 0, r * 0.4, -1.2, 1.2); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
      ctx.restore();
    },
    cursed(ctx, r, a, c, t) {
      const p = P(ctx);
      ctx.save(); ctx.globalAlpha = 0.55;
      for (let i = 0; i < 3; i++) p.circle(Math.sin(t * 3 + i * 2) * r * 0.8, r * 0.7 - i * 4, 4).fill('#b56cff');
      ctx.restore();
      p.poly([-r * 0.85, r * 0.9, -r * 0.35, -r * 0.4, r * 0.35, -r * 0.4, r * 0.85, r * 0.9]).both(c('#4a3a6b'));
      p.circle(0, -r * 0.7, r * 0.45).both(c('#d8cfe6'));
      p.poly([-r * 0.45, -r * 0.95, -r * 0.75, -r * 1.6, -r * 0.15, -r * 1.05]).both(c('#2b2140'));
      p.poly([r * 0.45, -r * 0.95, r * 0.75, -r * 1.6, r * 0.15, -r * 1.05]).both(c('#2b2140'));
      p.circle(-r * 0.12, -r * 0.72, 3).fill('#b56cff'); p.circle(r * 0.18, -r * 0.72, 3).fill('#b56cff');
      const oy = Math.sin(t * 4) * 3;
      ctx.globalAlpha = 0.35; p.circle(r * 0.95, -r * 0.2 + oy, r * 0.42 + a.atk * 3).fill('#b56cff'); ctx.globalAlpha = 1;
      p.circle(r * 0.95, -r * 0.2 + oy, r * 0.25 + a.atk * 3).both(c('#c99bff'), 1.5);
    },
    // ---- enemies
    rat(ctx, r, a, c, t) {
      const p = P(ctx);
      ctx.beginPath(); ctx.moveTo(-r * 0.8, r * 0.2); ctx.quadraticCurveTo(-r * 1.6, r * 0.2 + Math.sin(t * 10) * 5, -r * 1.7, -r * 0.4);
      ctx.lineWidth = 2.5; ctx.strokeStyle = c('#e8a3a3'); ctx.stroke();
      p.ell(0, r * 0.1, r * 0.95, r * 0.65).both(c('#7d7d86'));
      p.poly([-r * 0.3, -r * 0.5, 0, -r * 0.75, r * 0.3, -r * 0.5]).both(c('#9a8a6a'), 1.5);
      p.circle(r * 0.35, -r * 0.55, r * 0.3).both(c('#9a9aa3'));
      p.circle(r * 0.85, 0, r * 0.12).fill('#e8a3a3');
      p.circle(r * 0.55, -r * 0.15, 2.5).fill('#ff3b3b');
    },
    gremlin(ctx, r, a, c) {
      const p = P(ctx);
      p.ell(0, r * 0.2, r * 0.7, r * 0.7).both(c('#5e8f4d'));
      p.circle(0, -r * 0.55, r * 0.55).both(c('#6fa65b'));
      p.poly([-r * 0.45, -r * 0.6, -r * 1.2, -r * 0.4, -r * 0.4, -r * 0.3]).both(c('#6fa65b'), 1.5);
      p.rr(-r * 0.15, -r * 0.85, r * 0.75, r * 0.3, 4).both(c('#8a6a3a'), 1.5);
      p.circle(r * 0.1, -r * 0.7, r * 0.12).both('#a6e3ff', 1); p.circle(r * 0.4, -r * 0.7, r * 0.12).both('#a6e3ff', 1);
      ctx.save(); ctx.translate(r * 0.5, r * 0.05); ctx.rotate(-a.atk * 0.3);
      p.rr(0, -3, r * 0.9, 6, 2).both(c('#6b4a2f'), 1.5);
      ctx.beginPath(); ctx.arc(r * 0.7, 0, r * 0.45, -1.3, 1.3); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
      ctx.restore();
    },
    golem(ctx, r, a, c) {
      const p = P(ctx);
      p.rr(-r * 0.55, r * 0.45, r * 0.4, r * 0.5, 3).both(c('#5b4a3c'));
      p.rr(r * 0.15, r * 0.45, r * 0.4, r * 0.5, 3).both(c('#5b4a3c'));
      p.rr(-r * 0.7, -r * 0.7, r * 1.4, r * 1.25, 6).both(c('#d8d4c8'));
      p.line(-r * 0.7, -r * 0.15, r * 0.7, -r * 0.15, 2.5);
      p.rr(r * 0.45, -r * 0.6, r * 0.12, r * 0.3, 2).fill(INK);
      p.circle(-r * 0.95, r * 0.05, r * 0.38).both(c('#333'));
      p.circle(-r * 0.95, r * 0.05, r * 0.15).fill('#777');
      p.circle(r * 0.95 + a.atk * 8, r * 0.05, r * 0.38).both(c('#333'));
      p.circle(r * 0.95 + a.atk * 8, r * 0.05, r * 0.15).fill('#777');
      p.circle(-r * 0.2, -r * 0.45, r * 0.11).fill('#ffcc33'); p.circle(r * 0.15, -r * 0.45, r * 0.11).fill('#ffcc33');
      p.rr(-r * 0.35, -r * 1.05, r * 0.7, r * 0.35, 3).both(c('#8a7360'));
    },
    beetle(ctx, r, a, c, t) {
      const p = P(ctx);
      for (const lx of [-0.5, 0, 0.5]) { p.line(r * lx, 0, r * lx - 4, r * 0.9, 2.5); p.line(r * lx, 0, r * lx + 4, -r * 0.9, 2.5); }
      p.ell(0, 0, r * 0.95, r * 0.75).both(c('#2f2f3a'));
      p.line(0, -r * 0.75, 0, r * 0.75, 2, '#555');
      p.circle(-r * 0.4, -r * 0.3, 3.5).fill('#d9534f'); p.circle(r * 0.2, r * 0.35, 3.5).fill('#d9534f');
      p.circle(r * 0.9, 0, r * 0.35).both(c('#3d3d4a'));
      p.line(-r * 0.6, -r * 0.5, -r * 0.9, -r * 1.1, 2, '#c9a35a');
      if (Math.sin(t * 20) > 0) p.circle(-r * 0.9, -r * 1.15, 3.5).fill('#ffd84a');
    },
    shaman(ctx, r, a, c, t) {
      const p = P(ctx);
      p.line(r * 0.7, r * 0.9, r * 0.9, -r * 1.4, 3, c('#6b4a2f'));
      ctx.globalAlpha = 0.3 + a.atk * 0.3; p.circle(r * 0.9, -r * 1.5, r * 0.45).fill('#5fd068'); ctx.globalAlpha = 1;
      p.circle(r * 0.9, -r * 1.5, r * 0.25 + Math.sin(t * 5) * 1).both('#a8ffb0', 1.5);
      p.poly([-r * 0.8, r * 0.9, -r * 0.2, -r * 0.6, r * 0.4, -r * 0.6, r * 0.7, r * 0.9]).both(c('#b2593a'));
      p.circle(0, -r * 0.75, r * 0.45).both(c('#c9b48a'));
      ctx.save(); ctx.translate(0, -r * 0.75);
      for (let i = 0; i < 8; i++) { ctx.rotate(TAU / 8); P(ctx).rr(-2, -r * 0.62, 4, 6, 1).fill(c('#8a7360')); }
      ctx.restore();
      p.circle(-r * 0.12, -r * 0.78, 2.5).fill(INK); p.circle(r * 0.15, -r * 0.78, 2.5).fill(INK);
    },
    squire(ctx, r, a, c) {
      const p = P(ctx);
      p.rr(-r * 0.5, r * 0.45, r * 0.35, r * 0.45, 2).both(c('#7a7f88'));
      p.rr(r * 0.15, r * 0.45, r * 0.35, r * 0.45, 2).both(c('#7a7f88'));
      p.rr(-r * 0.6, -r * 0.55, r * 1.2, r * 1.1, 5).both(c('#c7ccd4'));
      p.line(-r * 0.6, -r * 0.25, r * 0.6, -r * 0.25, 1.5, '#8a9099'); p.line(-r * 0.6, r * 0.15, r * 0.6, r * 0.15, 1.5, '#8a9099');
      p.ell(0, -r * 0.85, r * 0.5, r * 0.4).both(c('#b0b6bf'));
      p.rr(-r * 0.1, -r * 0.92, r * 0.5, r * 0.1, 1).fill(INK);
      ctx.save(); ctx.translate(r * 0.7, 0); ctx.rotate(-0.6 + a.atk * 1.4);
      p.rr(-2, -r * 1.1, 5, r * 1.1, 2).both(c('#dfe7f2'), 1.5); ctx.restore();
      p.ell(-r * 0.75, r * 0.05, r * 0.3, r * 0.5).both(c('#a8603c'));
    },
    kingRust(ctx, r, a, c) {
      const p = P(ctx);
      p.rr(-r * 0.5, r * 0.6, r * 0.35, r * 0.4, 3).both(c('#4a3524'));
      p.rr(r * 0.15, r * 0.6, r * 0.35, r * 0.4, 3).both(c('#4a3524'));
      p.poly([-r * 0.75, -r * 0.55, r * 0.75, -r * 0.55, r * 0.6, r * 0.7, -r * 0.6, r * 0.7]).both(c('#a8603c'));
      for (const y of [-0.25, 0.05, 0.35]) p.line(-r * 0.68, r * y, r * 0.68, r * y, 2, '#7a4428');
      p.rr(-r * 0.85, -r * 0.75, r * 1.7, r * 0.25, 4).both(c('#c27a50'));
      eyes(ctx, r * 0.1, -r * 0.35, r * 0.2, r * 0.13, 1, '#ffef9a', '#c0392b');
      for (let i = 0; i < 5; i++) p.line(-r * 0.35 + i * r * 0.18, -r * 0.1, -r * 0.4 + i * r * 0.2, r * 0.25, 2, '#e07b39');
      p.poly([-r * 0.5, -r * 0.75, -r * 0.5, -r * 1.25, -r * 0.25, -r * 1.0, 0, -r * 1.35, r * 0.25, -r * 1.0, r * 0.5, -r * 1.25, r * 0.5, -r * 0.75]).both(c('#ffd84a'));
      ctx.save(); ctx.translate(r * 0.85, 0); ctx.rotate(-0.4 + a.atk * 1.5);
      p.rr(-3, -r * 1.1, 6, r * 1.2, 2).both(c('#6b4a2f')); p.ell(0, -r * 1.15, r * 0.25, r * 0.18).both(c('#c0392b'));
      ctx.restore();
    },
    wyrm(ctx, r, a, c, t) {
      const p = P(ctx);
      const flap = Math.sin(t * 5) * 0.3;
      p.poly([-r * 0.2, -r * 0.4, -r * 1.3, -r * 1.3 - flap * r, -r * 0.9, -r * 0.2]).both(c('#8f2a1e'));
      p.ell(-r * 0.9, r * 0.3, r * 0.5, r * 0.45).both(c('#b08a3a'));
      P(ctx).circle(-r * 0.9, r * 0.2, r * 0.12).fill('#ffd84a');
      p.ell(0, r * 0.1, r * 0.85, r * 0.65).both(c('#c2402c'));
      p.ell(r * 0.1, r * 0.25, r * 0.5, r * 0.35).both(c('#f2b27a'));
      p.poly([r * 0.3, -r * 0.4, r * 0.95, -r * 1.25 + flap * r, r * 0.7, -r * 0.2]).both(c('#8f2a1e'));
      p.ell(r * 0.85, -r * 0.55, r * 0.5, r * 0.35).both(c('#d04a33'));
      p.poly([r * 0.6, -r * 0.8, r * 0.5, -r * 1.25, r * 0.8, -r * 0.85]).both(c('#f2ead3'), 1.5);
      eyes(ctx, r * 0.95, -r * 0.65, r * 0.12, r * 0.1, 1, '#ffef9a');
      if (a.atk > 0.3) { ctx.save(); ctx.globalAlpha = a.atk; p.circle(r * 1.45, -r * 0.5, r * 0.25).fill('#ffb347'); ctx.restore(); }
    },
    archmagnet(ctx, r, a, c, t) {
      const p = P(ctx);
      p.poly([-r * 0.8, r * 0.9, -r * 0.3, -r * 0.4, r * 0.3, -r * 0.4, r * 0.8, r * 0.9]).both(c('#3c5aa8'));
      for (let i = 0; i < 4; i++) P(ctx).circle(-r * 0.4 + i * r * 0.27, r * 0.4, 2.5).fill('#ffd84a');
      p.circle(0, -r * 0.65, r * 0.42).both(c('#e8dcc8'));
      eyes(ctx, r * 0.05, -r * 0.65, r * 0.15, r * 0.1, 1, '#fff', '#3c5aa8');
      ctx.save(); ctx.translate(0, -r * 1.25); ctx.rotate(Math.sin(t * 2) * 0.1);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.6, Math.PI, 0); ctx.lineWidth = r * 0.32; ctx.strokeStyle = c('#d9534f'); ctx.stroke();
      p.rr(-r * 0.76, -2, r * 0.32, r * 0.28, 2).both(c('#dfe7f2'), 1.5);
      p.rr(r * 0.44, -2, r * 0.32, r * 0.28, 2).both(c('#dfe7f2'), 1.5);
      ctx.restore();
      ctx.save(); ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 6);
      ctx.beginPath(); ctx.arc(0, -r * 1.25, r * 0.95, Math.PI * 1.1, Math.PI * 1.9); ctx.lineWidth = 2; ctx.strokeStyle = '#6fa8ff'; ctx.stroke();
      ctx.restore();
    },
    larry(ctx, r, a, c, t) {
      const p = P(ctx);
      p.ell(-r * 0.5, -r * 0.2, r * 0.8, r * 0.85).both(c('#c9a35a'));
      p.line(-r * 0.8, -r * 0.9, -r * 0.2, -r * 0.9, 3, '#6b4a2f');
      ctx.save(); ctx.fillStyle = '#6b4a2f'; ctx.font = `bold ${Math.round(r)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('$', -r * 0.5, r * 0.1); ctx.restore();
      p.ell(r * 0.3, r * 0.2, r * 0.55, r * 0.6).both(c('#d8b13a'));
      p.circle(r * 0.45, -r * 0.45, r * 0.45).both(c('#e5c45a'));
      p.poly([r * 0.2, -r * 0.6, -r * 0.2, -r * 1.0, r * 0.25, -r * 0.35]).both(c('#e5c45a'), 1.5);
      eyes(ctx, r * 0.55, -r * 0.5, r * 0.14, r * 0.12, 1);
      ctx.beginPath(); ctx.arc(r * 0.55, -r * 0.2, r * 0.15, 0, Math.PI); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
    },
    intern(ctx, r, a, c) {
      const p = P(ctx);
      p.rr(-r * 0.5, -r * 0.3, r * 1.0, r * 1.1, 4).both(c('#7fa6c9'));
      p.line(0, -r * 0.3, r * 0.1, r * 0.3, 2, '#d9534f');
      p.rr(0, r * 0.25, r * 0.25, r * 0.3, 1).both(c('#fff'), 1);
      p.circle(0, -r * 0.7, r * 0.45).both(c('#f0c9a0'));
      eyes(ctx, r * 0.05, -r * 0.72, r * 0.15, r * 0.1, 1);
      p.rr(r * 0.55, -r * 0.1 - a.atk * 6, r * 0.35, r * 0.45, 2).both(c('#f2ead3'), 1.5);
    },
  };
  SB.BODIES = BODIES;

  // ------------------------------------------------------------ item icons
  const ICONS = {
    knife(p) { p.poly([-18, 14, 10, -14, 16, -10, -12, 18]).both('#c8cdd4'); p.rr(-24, 12, 14, 8, 3).both('#8a5a3b'); },
    stick(p) { p.line(-18, 18, 16, -16, 6, '#8a5a3b'); p.poly([16, -16, 22, -24, 12, -20]).both('#c8cdd4'); },
    baguette(p) { p.ell(0, 0, 24, 9, -0.6).both('#e0a95f'); for (let i = -1; i <= 1; i++) p.line(i * 9 - 3, i * -6 + 5, i * 9 + 4, i * -6 - 3, 2, '#9a6a30'); },
    fork(p) { p.line(-16, 20, 6, -4, 5, '#c8cdd4'); for (const o of [-6, 0, 6]) p.line(6 + o, -4 - o * 0.2, 14 + o, -20, 3, '#c8cdd4'); },
    hammer(p) { p.line(-16, 20, 8, -6, 5, '#8a5a3b'); p.rr(-4, -24, 26, 16, 3).both('#7d8896'); },
    axe(p) { p.line(-16, 20, 10, -14, 5, '#5a3d2b'); p.poly([4, -22, 20, -26, 22, -6, 8, -8]).both('#7a5ab0'); p.circle(14, -16, 3).fill('#d0a6ff'); },
    cutlass(p) { p.ctx.beginPath(); p.ctx.moveTo(-14, 16); p.ctx.quadraticCurveTo(10, 4, 18, -22); p.ctx.lineTo(8, -2); p.ctx.closePath(); p.both('#dfe7f2'); p.circle(-14, 16, 6).both('#ffd84a'); },
    pin(p) { p.rr(-16, -8, 32, 16, 6).both('#d9b07a'); p.rr(-26, -4, 12, 8, 3).both('#a0703f'); p.rr(14, -4, 12, 8, 3).both('#a0703f'); },
    sword(p) { p.rr(-14, 6, 28, 18, 3).both('#3f8a4a'); p.poly([-3, 6, -3, -24, 0, -28, 3, -24, 3, 6]).both('#ffe9a0'); p.rr(-10, 2, 20, 5, 2).both('#ffd84a'); },
    pan(p) { p.ell(-2, 0, 18, 14).both('#7d8896'); p.rr(14, -4, 16, 7, 3).both('#3b2b20'); },
    bouncy(p) { p.rr(-18, -12, 36, 26, 8).both('#ff7ab6'); for (const x of [-14, -2, 10]) p.circle(x + 2, -14, 5).both('#ffd84a', 1.5); },
    barrel(p) { p.rr(-14, -20, 28, 40, 8).both('#a86a3b'); p.line(-14, -8, 14, -8, 3); p.line(-14, 8, 14, 8, 3); },
    cardigan(p) { p.poly([-18, -16, 18, -16, 22, 20, -22, 20]).both('#5f9a5f'); for (let i = 0; i < 6; i++) p.poly([-16 + i * 7, -16, -13 + i * 7, -24, -10 + i * 7, -16]).both('#3b6a3b', 1.5); },
    mail(p) { p.rr(-16, -18, 32, 36, 6).both('#7d8896'); p.ctx.beginPath(); p.ctx.arc(0, -2, 10, Math.PI, 0); p.ctx.lineWidth = 6; p.ctx.strokeStyle = '#d9534f'; p.ctx.stroke(); },
    scroll(p) { p.rr(-18, -14, 36, 28, 4).both('#f2e3b5'); p.circle(-18, 0, 6).both('#d9b07a'); p.circle(18, 0, 6).both('#d9b07a'); p.line(-8, -4, 8, -4, 2, '#8a6a3a'); p.line(-8, 4, 4, 4, 2, '#8a6a3a'); },
    onesie(p) { p.poly([-16, -16, 16, -16, 18, 20, 4, 20, 0, 8, -4, 20, -18, 20]).both('#c2402c'); p.poly([-8, -16, 0, -26, 8, -16]).both('#ffd84a', 1.5); },
    sand(p) { p.ell(0, 6, 18, 14).both('#e6c88a'); p.rr(-6, -18, 12, 10, 3).both('#8a5a3b'); for (let i = 0; i < 4; i++) p.circle(-8 + i * 6, 4, 1.8).fill('#a0864a'); },
    foot(p) { p.ell(0, 4, 10, 16).both('#9a9aa3'); for (const x of [-8, 0, 8]) p.line(x, 16, x * 1.4, 24, 3, '#e8a3a3'); p.line(0, -12, 0, -24, 3, '#ffd84a'); },
    bees(p) { p.ell(0, 6, 18, 16).both('#c9a35a'); p.line(-6, -10, 6, -10, 3, '#6b4a2f'); for (const [x, y] of [[-12, -20], [14, -16], [2, -26]]) { p.ell(x, y, 5, 4).both('#ffd84a', 1.5); } },
    intern(p) { p.circle(0, -8, 11).both('#f0c9a0'); p.rr(-12, 4, 24, 18, 4).both('#7fa6c9'); p.rr(-4, 8, 8, 10, 1).both('#fff', 1); },
    coupon(p) { p.rr(-22, -12, 44, 24, 3).both('#f2ead3'); p.ctx.setLineDash([3, 3]); p.line(-10, -12, -10, 12, 2, '#8a6a3a'); p.ctx.setLineDash([]); p.circle(6, 0, 6).both('#5fd068', 1.5); },
    locket(p) { p.line(-10, -22, 0, -10, 2, '#ffd84a'); p.line(10, -22, 0, -10, 2, '#ffd84a'); p.circle(0, 4, 14).both('#ffd84a'); p.circle(0, 4, 7).both('#3c5aa8', 1.5); },
    mortgage(p) { p.rr(-16, -20, 32, 40, 3).both('#f2ead3'); for (let i = 0; i < 4; i++) p.line(-10, -12 + i * 7, 10, -12 + i * 7, 2, '#9a9aa3'); p.circle(8, 14, 7).both('#d9534f', 1.5); },
    crown(p) { p.poly([-20, 14, -20, -12, -10, 0, 0, -18, 10, 0, 20, -12, 20, 14]).both('#ffd84a'); p.circle(0, 6, 4).fill('#ff4fa3'); p.circle(-11, 7, 3).fill('#4aa3ff'); p.circle(11, 7, 3).fill('#5fd068'); },
    tape(p) { p.circle(0, 0, 18).both('#b8bec7'); p.circle(0, 0, 8).both('#ece8dc'); p.rr(10, 8, 16, 8, 2).both('#b8bec7', 1.5); },
    jar(p) { p.rr(-14, -12, 28, 32, 6).both('#cdeaf7'); p.rr(-16, -18, 32, 8, 3).both('#8a5a3b'); for (const [x, y] of [[-5, 0], [6, 8], [-2, 12]]) p.ell(x, y, 4, 3).both('#ffd84a', 1); },
    pie(p) { p.ell(0, 6, 22, 12).both('#c98b4a'); p.ell(0, 2, 20, 9).both('#e0b070'); p.line(-8, 0, 6, 4, 2, '#8a5a3b'); p.ctx.globalAlpha = 0.6; p.circle(-4, -14, 4).fill('#7fc45a'); p.circle(4, -20, 3).fill('#7fc45a'); p.ctx.globalAlpha = 1; },
  };

  SB.drawIcon = function (canvas, iconKey, rarity) {
    const ctx = canvas.getContext('2d');
    const s = canvas.width;
    ctx.clearRect(0, 0, s, s);
    ctx.save();
    if (rarity != null) {
      const col = SB.RARITY_COLORS[rarity];
      const g = ctx.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
      g.addColorStop(0, col + '88'); g.addColorStop(1, col + '00');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    }
    ctx.translate(s / 2, s / 2); ctx.scale(s / 64, s / 64);
    const p = P(ctx); p.ctx = ctx;
    (ICONS[iconKey] || ICONS.barrel)(p);
    ctx.restore();
  };

  SB.drawPortrait = function (canvas, id) {
    const ctx = canvas.getContext('2d');
    const s = canvas.width;
    ctx.clearRect(0, 0, s, s);
    const def = SB.FIGHTERS[id] || SB.ENEMIES[id];
    ctx.save();
    ctx.translate(s / 2, s * 0.62);
    const sc = (s * 0.3) / def.r;
    ctx.scale(sc, sc);
    BODIES[id](ctx, def.r, { atk: 0, hit: 0, special: 0 }, (x) => x, 0);
    ctx.restore();
  };

  // ------------------------------------------------------------ arena backgrounds
  function buildBackground(arena, scale) {
    const c = document.createElement('canvas');
    c.width = W * scale; c.height = H * scale;
    const ctx = c.getContext('2d');
    ctx.scale(scale, scale);
    const rng = SB.makeRng(arena.id.length * 977);
    const p = P(ctx);
    ctx.fillStyle = arena.ground; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 60; i++) { p.ell(rng() * W, rng() * H, 18 + rng() * 40, 10 + rng() * 22, rng() * 3).fill(arena.ground2); }
    ctx.globalAlpha = 1;
    if (arena.id === 'yard') {
      for (let i = 0; i < 6; i++) { ctx.globalAlpha = 0.12; p.line(0, 120 + i * 80 + rng() * 20, W, 100 + i * 80 + rng() * 40, 8, '#6d5340'); }
      ctx.globalAlpha = 1;
      for (let i = 0; i < 18; i++) { p.rr(i * 42 - 6, -6, 40, 26, 3).both(i % 2 ? '#8b9aa8' : '#7a8896', 2); }
      for (let i = 0; i < 18; i++) { p.rr(i * 42 - 6, H - 16, 40, 24, 3).both(i % 2 ? '#8b9aa8' : '#7a8896', 2); }
      for (const [x, y] of [[30, 40], [W - 40, 50], [40, H - 50], [W - 30, H - 40]]) for (let k = 0; k < 4; k++) p.circle(x + (rng() - 0.5) * 30, y + (rng() - 0.5) * 20, 10 + rng() * 8).both(['#6b5a4a', '#5f6a75', '#a86a3b', '#7d7d86'][k], 2);
    } else if (arena.id === 'smeltery') {
      ctx.strokeStyle = '#2f292b'; ctx.lineWidth = 2;
      for (let x = 0; x < W; x += 60) for (let y = 0; y < H; y += 60) ctx.strokeRect(x + (y / 60 % 2) * 30, y, 60, 60);
      ctx.globalAlpha = 0.6;
      for (let i = 0; i < 12; i++) { const x = rng() * W, y = rng() * H; p.line(x, y, x + (rng() - 0.5) * 70, y + (rng() - 0.5) * 70, 2, '#ff7b2e'); }
      ctx.globalAlpha = 1;
      for (let i = 0; i < 10; i++) p.rr(i * 76, -10, 50, 30, 4).both('#3a3133', 2);
      for (let i = 0; i < 10; i++) p.rr(i * 76 + 20, H - 18, 50, 30, 4).both('#3a3133', 2);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#87a868'); g.addColorStop(1, '#6f8f52');
      ctx.fillStyle = g; ctx.globalAlpha = 0.5; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
      for (let i = 0; i < 140; i++) { const x = rng() * W, y = rng() * H; p.line(x, y, x + 2, y - 6, 1.5, '#5d7a45'); }
      // crumbly cliff edges on both sides
      for (const side of [0, 1]) {
        ctx.fillStyle = '#8a7a62';
        ctx.beginPath();
        const x0 = side ? W : 0, dir = side ? -1 : 1;
        ctx.moveTo(x0, 0);
        for (let y = 0; y <= H; y += 20) ctx.lineTo(x0 + dir * (10 + rng() * 10), y);
        ctx.lineTo(x0, H); ctx.closePath(); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
      }
      for (let i = 0; i < 10; i++) p.rr(i * 76, -10, 50, 26, 6).both('#9aa3ad', 2);
      for (let i = 0; i < 10; i++) p.rr(i * 76 + 20, H - 14, 50, 26, 6).both('#9aa3ad', 2);
    }
    // soft vignette
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    return c;
  }

  // ------------------------------------------------------------ renderer
  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.particles = [];
      this.texts = [];
      this.bubbles = [];
      this.shake = 0;
      this.flash = 0;
      this.bgCache = {};
      this.reducedMotion = false;
      this.time = 0;
      this.zoom = 1; this.zoomTarget = 1; this.focus = null;
      this.resize();
    }
    // Called every frame with the real frame time: drops canvas resolution on slow devices.
    trackPerf(dt) {
      this.perfAvg = this.perfAvg == null ? dt : this.perfAvg * 0.95 + dt * 0.05;
      this.perfT = (this.perfT || 0) + dt;
      if (this.perfT > 2 && this.perfAvg > 1 / 40 && this.quality > 0.5) {
        this.quality = Math.max(0.5, this.quality - 0.25); this.perfT = 0; this.resize();
      }
    }
    resize() {
      if (this.quality == null) this.quality = 1;
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1) * this.quality);
      const r = this.canvas.getBoundingClientRect();
      this.cssW = Math.max(1, r.width); this.cssH = Math.max(1, r.height);
      this.canvas.width = Math.round(this.cssW * dpr); this.canvas.height = Math.round(this.cssH * dpr);
      this.dpr = dpr;
      const s = Math.min(this.cssW / W, this.cssH / H);
      this.scale = s; this.ox = (this.cssW - W * s) / 2; this.oy = (this.cssH - H * s) / 2;
      this.bgCache = {};
    }
    reset() { this.particles = []; this.texts = []; this.bubbles = []; this.shake = 0; this.flash = 0; this.zoom = 1; this.zoomTarget = 1; this.focus = null; }
    toWorld(cx, cy) { return { x: (cx - this.ox) / this.scale, y: (cy - this.oy) / this.scale }; }

    addShake(n) { if (!this.reducedMotion) this.shake = Math.min(7, this.shake + n); }

    burst(x, y, n, colors, speed = 200, size = 4, life = 0.6, type = 'spark') {
      if (this.particles.length > 600) return;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, sp = speed * (0.3 + Math.random() * 0.9);
        this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (type === 'debris' ? 120 : 0), life: life * (0.6 + Math.random() * 0.6), max: life, size: size * (0.6 + Math.random() * 0.8), color: colors[i % colors.length], type, rot: Math.random() * 6 });
      }
    }
    text(x, y, str, color, size = 18, vy = -60, life = 0.9) {
      this.texts.push({ x, y, str, color, size, vy, life, max: life });
      if (this.texts.length > 60) this.texts.shift();
    }

    handleEvents(b, events) {
      for (const e of events) {
        switch (e.type) {
          case 'hit': {
            const enemyHurt = e.team === 1;
            const col = e.kind === 'curse' ? '#c99bff' : e.kind === 'hazard' ? '#ff9a4a' : e.crit ? '#ffe14a' : enemyHurt ? '#ffffff' : '#ff7a7a';
            if (e.kind !== 'curse' || Math.random() < 0.08) {
              const amt = e.kind === 'curse' ? '' : e.amount;
              const recent = !e.crit && this.texts.find((x) => x.uid === e.uid && x.num != null && x.max - x.life < 0.35);
              if (recent && amt !== '') {
                // Rapid hits on one target roll up into one growing number instead of a messy stack.
                recent.num += amt; recent.str = `${recent.num}`; recent.life = recent.max; recent.size = Math.min(26, recent.size + 1.5); recent.x = e.x; recent.y = e.y; recent.vy = -60;
              } else if (amt !== '') {
                this.text(e.x + (Math.random() - 0.5) * 16, e.y, e.crit ? `${amt}!` : `${amt}`, col, e.crit ? 26 : e.amount > 60 ? 21 : 16);
                const tx = this.texts[this.texts.length - 1]; tx.uid = e.uid; if (!e.crit) tx.num = amt;
              }
            }
            if (e.blocked) this.text(e.x, e.y - 18, 'BLOCK', '#c7ccd4', 13);
            if (e.kind !== 'curse' && e.kind !== 'hazard') this.burst(e.x, e.y, e.crit ? 10 : 4, e.crit ? ['#ffe14a', '#fff'] : ['#fff', '#ffd9a0'], e.crit ? 260 : 160, 3, 0.35);
            if (e.crit) this.addShake(2);
            break;
          }
          case 'death':
            this.burst(e.x, e.y, e.boss ? 60 : 16, ['#7d7d86', '#a86a3b', '#c7ccd4', '#ffd84a'], e.boss ? 380 : 230, 5, 0.9, 'debris');
            this.burst(e.x, e.y, 8, ['rgba(80,70,60,0.6)'], 70, 14, 0.8, 'smoke');
            if (e.boss) { this.addShake(7); this.flash = 0.6; }
            break;
          case 'explode':
            this.burst(e.x, e.y, e.big ? 40 : 18, ['#ffd84a', '#ff9a3a', '#ff5a3a', '#fff2a8'], e.big ? 420 : 280, e.big ? 7 : 5, 0.55);
            this.burst(e.x, e.y, e.big ? 14 : 7, ['rgba(60,50,50,0.55)'], 90, e.big ? 26 : 16, 1.0, 'smoke');
            this.particles.push({ type: 'ring', x: e.x, y: e.y, r: 4, maxR: e.r || 60, life: 0.35, max: 0.35, color: '#ffd84a' });
            this.addShake(e.big ? 6 : 3);
            break;
          case 'ring':
            this.particles.push({ type: 'ring', x: e.x, y: e.y, r: 8, maxR: e.r, life: 0.45, max: 0.45, color: e.color });
            break;
          case 'leap': this.burst(e.x1, e.y1, 10, ['#d8c4a0', '#fff'], 160, 6, 0.5, 'smoke'); break;
          case 'slam': this.burst(e.x, e.y, 6, ['#d8c4a0', '#fff'], 150, 4, 0.4); this.addShake(1.5); break;
          case 'crush': this.burst(e.x, e.y, 30, ['#d8c4a0', '#9a8a6a'], 300, 8, 0.7, 'debris'); this.addShake(7); break;
          case 'geyser': this.burst(e.x, e.y, 30, ['#ff7b2e', '#ffd84a', '#fff'], 360, 6, 0.8); this.addShake(4); break;
          case 'clang': this.burst(e.x, e.y, 5, ['#fff', '#ffe066'], 200, 3, 0.25); break;
          case 'thud': this.burst(e.x, e.y, 10, ['#b8a888', '#8a7a62'], 160, 6, 0.5, 'debris'); this.addShake(e.kind === 'anvil' ? 4 : 1.5); break;
          case 'storm': this.flash = 0.25; break;
          case 'stormBlast':
            this.burst(e.x, e.y, 60, e.enemy ? ['#6fa8ff', '#fff'] : ['#ffd84a', '#7fe0ff', '#fff', '#ff9a3a'], 520, 7, 0.8);
            this.particles.push({ type: 'ring', x: e.x, y: e.y, r: 10, maxR: 260, life: 0.5, max: 0.5, color: e.enemy ? '#6fa8ff' : '#7fe0ff' });
            this.addShake(7); this.flash = 0.4;
            break;
          case 'heal': this.text(e.x, e.y, `+${e.amount}`, '#5fd068', 15); this.burst(e.x, e.y, 4, ['#8dffa0'], 60, 3, 0.6); break;
          case 'text': this.text(e.x, e.y, e.text, e.color, e.big ? 26 : 18, -40, e.big ? 1.6 : 1.1); break;
          case 'quip': this.bubbles = this.bubbles.filter((q) => q.uid !== e.uid); this.bubbles.push({ uid: e.uid, text: e.text, life: 2.4, team: e.team }); break;
          case 'zap': this.particles.push({ type: 'zap', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, life: 0.22, max: 0.22 }); break;
          case 'healbeam': this.particles.push({ type: 'zap', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, life: 0.35, max: 0.35, color: '#5fd068' }); break;
          case 'bees': if (e.all) { for (const u of SB.alive(b, 1)) this.burst(u.x, u.y, 8, ['#ffd84a', INK], 120, 3, 0.8); } else this.burst(e.x, e.y, 6, ['#ffd84a', INK], 120, 3, 0.7); break;
          case 'trap': this.burst(e.x, e.y, 8, ['#c8cdd4', '#fff'], 140, 3, 0.4); break;
          case 'pickup': this.burst(e.x, e.y, 6, ['#ffd84a'], 100, 3, 0.4); break;
          case 'echo': this.burst(e.x, e.y, 4, ['#e0a95f'], 100, 4, 0.4); break;
          case 'sizzle': this.burst(e.x, e.y, 2, ['#ff7b2e', 'rgba(90,90,90,0.5)'], 50, 5, 0.5, 'smoke'); break;
          case 'poof': this.burst(e.x, e.y, 20, ['rgba(255,220,120,0.7)', '#fff'], 160, 10, 0.7, 'smoke'); break;
          case 'special': {
            const u = b.units.find((q) => q.uid === e.uid);
            if (u) { this.text(u.x, u.y - u.r - 30, e.name, '#ffe14a', 24, -30, 1.3); this.burst(u.x, u.y, 14, ['#ffe14a', '#fff'], 220, 4, 0.5); }
            this.addShake(2);
            break;
          }
          case 'finish':
            this.focus = { x: e.x, y: e.y }; this.zoomTarget = this.reducedMotion ? 1 : 1.18;
            this.burst(e.x, e.y, 40, ['#ffe14a', '#fff', '#ff9a3a'], 380, 6, 1.0);
            this.text(e.x, e.y - 50, 'K.O.!', '#ffe14a', 46, -20, 1.6);
            this.addShake(5);
            break;
        }
      }
    }

    update(dt) {
      this.time += dt;
      for (const p of this.particles) {
        p.life -= dt;
        if (p.type === 'ring' || p.type === 'zap') continue;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.type === 'debris') p.vy += 500 * dt;
        const fr = Math.exp(-(p.type === 'smoke' ? 2 : 3) * dt);
        p.vx *= fr; p.vy *= fr;
        if (p.type === 'smoke') p.size += 14 * dt;
      }
      this.particles = this.particles.filter((p) => p.life > 0);
      for (const t of this.texts) { t.life -= dt; t.y += t.vy * dt; t.vy *= Math.exp(-2 * dt); }
      this.texts = this.texts.filter((t) => t.life > 0);
      for (const q of this.bubbles) q.life -= dt;
      this.bubbles = this.bubbles.filter((q) => q.life > 0);
      this.shake *= Math.exp(-10 * dt);
      this.flash = Math.max(0, this.flash - dt * 1.6);
      this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * 6);
    }

    bg(arena) {
      const key = arena.id;
      if (!this.bgCache[key]) this.bgCache[key] = buildBackground(arena, Math.min(2, this.scale * this.dpr * 1.05));
      return this.bgCache[key];
    }

    buildBackdrop(arena) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(this.cssW * this.dpr)); c.height = Math.max(1, Math.round(this.cssH * this.dpr));
      const ctx = c.getContext('2d');
      ctx.scale(this.dpr, this.dpr);
      const g = ctx.createLinearGradient(0, 0, 0, this.cssH);
      g.addColorStop(0, arena.sky[0]); g.addColorStop(1, arena.sky[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, this.cssW, this.cssH);
      // Ground continues beyond the arena edges (top/bottom on phones) so it reads as a stage, not a letterbox.
      if (this.oy > 2) {
        const gy = ctx.createLinearGradient(0, 0, 0, this.oy);
        gy.addColorStop(0, shade(arena.ground2, -0.45)); gy.addColorStop(1, shade(arena.ground2, -0.15));
        ctx.fillStyle = gy; ctx.fillRect(0, 0, this.cssW, this.oy + 1);
        const gb = ctx.createLinearGradient(0, this.oy + H * this.scale, 0, this.cssH);
        gb.addColorStop(0, shade(arena.ground2, -0.15)); gb.addColorStop(1, shade(arena.ground2, -0.45));
        ctx.fillStyle = gb; ctx.fillRect(0, this.oy + H * this.scale - 1, this.cssW, this.cssH);
        drawSkyline(ctx, this.cssW, this.oy, arena, this.scale);
      }
      return c;
    }

    // Draw a battle (or a peaceful camp scene when b.idle is set).
    draw(b) {
      const ctx = this.ctx, dpr = this.dpr;
      const arena = b.arena;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Sky + stage floor + skyline never change during a battle: draw once per arena/size and reuse.
      const bk = `${arena.id}|${this.cssW}|${this.cssH}|${this.dpr}`;
      if (this.backdropKey !== bk) { this.backdropKey = bk; this.backdrop = this.buildBackdrop(arena); }
      ctx.drawImage(this.backdrop, 0, 0, this.cssW, this.cssH);
      ctx.save();
      const sx = this.shake ? (Math.random() - 0.5) * this.shake * 2 : 0, sy = this.shake ? (Math.random() - 0.5) * this.shake * 2 : 0;
      ctx.translate(this.ox + sx, this.oy + sy);
      ctx.scale(this.scale, this.scale);
      if (this.zoom > 1.001 && this.focus) {
        const fx = this.focus.x, fy = this.focus.y;
        ctx.translate(fx, fy); ctx.scale(this.zoom, this.zoom); ctx.translate(-fx, -fy);
      }
      ctx.drawImage(this.bg(arena), 0, 0, W, H);
      const t = this.time;
      const p = P(ctx);

      // hazards (floor layer)
      for (const h of b.hazards) {
        if (h.kind === 'molten') {
          ctx.globalAlpha = 0.25; p.ell(h.x, h.y, h.r + 14, h.r * 0.8 + 12).fill('#ff7b2e'); ctx.globalAlpha = 1;
          p.ell(h.x, h.y, h.r + Math.sin(t * 2 + h.x) * 3, h.r * 0.8).both('#ff7b2e', 3);
          p.ell(h.x, h.y, h.r * 0.6, h.r * 0.45).fill('#ffc24a');
          for (let i = 0; i < 3; i++) { const k = (t * 0.8 + i / 3) % 1; ctx.globalAlpha = 1 - k; p.circle(h.x + Math.sin(i * 7 + h.y) * h.r * 0.5, h.y + Math.cos(i * 5) * h.r * 0.3, 3 + k * 6).stroke(2, '#fff2a8'); ctx.globalAlpha = 1; }
        }
        if (h.kind === 'crusher') {
          // A hydraulic press: telegraphed by a pulsing hazard ring and a block descending from above.
          const ring = () => { ctx.save(); ctx.setLineDash([14, 10]); ctx.lineDashOffset = -t * 40; p.circle(h.x, h.y, h.r).stroke(4, '#ffd84a'); ctx.restore(); };
          if (h.state === 'warn') {
            const k = 1 - h.t / 1.6;
            ctx.globalAlpha = 0.18 + 0.2 * Math.abs(Math.sin(t * 12)); p.circle(h.x, h.y, h.r).fill('#ff3b3b'); ctx.globalAlpha = 1;
            ring();
            ctx.globalAlpha = 0.2 + k * 0.35; p.ell(h.x, h.y + 6, h.r * (0.5 + k * 0.45), h.r * (0.35 + k * 0.3)).fill('#000'); ctx.globalAlpha = 1;
            drawPress(ctx, h.x, h.y - (1 - k) * 160 - 10, h.r * 0.8, 0.55 + k * 0.45);
          } else if (h.state === 'slam') {
            p.circle(h.x, h.y, h.r * 1.05).fill('rgba(0,0,0,0.25)');
            drawPress(ctx, h.x, h.y, h.r * 0.95, 1);
          } else {
            ctx.globalAlpha = 0.35; ring(); ctx.globalAlpha = 1;
          }
        }
        if (h.kind === 'geyser' && h.state === 'warn') {
          ctx.globalAlpha = 0.4 + 0.3 * Math.sin(t * 25); p.circle(h.x, h.y, h.r + 30).stroke(4, '#fff2a8'); ctx.globalAlpha = 1;
        }
      }
      // telegraphed impacts
      for (const pd of b.pending) {
        const k = 1 - pd.t / pd.T;
        const col = pd.hurts === 0 ? '#ff3b3b' : pd.kind === 'junk' ? '#000' : '#ff9a3a';
        ctx.globalAlpha = 0.18 + 0.12 * Math.sin(t * 18);
        p.circle(pd.x, pd.y, pd.r).fill(col);
        ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.arc(pd.x, pd.y, pd.r, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke();
        ctx.globalAlpha = 0.3 + k * 0.4;
        p.ell(pd.x, pd.y, pd.r * 0.5 * (0.3 + k * 0.7), pd.r * 0.3 * (0.3 + k * 0.7)).fill('#000');
        ctx.globalAlpha = 1;
        if (pd.kind === 'anvil' || pd.kind === 'junk') {
          const fallY = pd.y - (1 - k) * 260;
          ctx.save(); ctx.translate(pd.x, fallY);
          if (pd.kind === 'anvil') { p.poly([-16, -4, 16, -4, 10, 6, 14, 12, -14, 12, -10, 6]).both('#4a4f57'); }
          else p.circle(0, 0, 12).both('#7d7d86');
          ctx.restore();
        }
      }
      // traps
      for (const tr of b.traps) {
        ctx.globalAlpha = tr.arm > 0 ? 0.4 : 1;
        p.circle(tr.x, tr.y, tr.r * 0.8).both('#5f6a75', 2);
        for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; p.line(tr.x + Math.cos(a) * tr.r * 0.4, tr.y + Math.sin(a) * tr.r * 0.4, tr.x + Math.cos(a) * tr.r * 0.85, tr.y + Math.sin(a) * tr.r * 0.85, 2, '#dfe7f2'); }
        ctx.globalAlpha = 1;
      }
      // pickups
      for (const pk of b.pickups) { ctx.save(); ctx.translate(pk.x, pk.y + Math.sin(t * 5 + pk.x) * 3); ctx.rotate(t * 2); gear(ctx, 8, '#ffd84a'); ctx.restore(); }

      // storm swirl (under units)
      const s = b.storm;
      if (s.state === 'pull') {
        ctx.save();
        ctx.globalAlpha = 0.18; p.circle(s.x, s.y, s.r).fill('#7fe0ff'); ctx.globalAlpha = 0.6;
        ctx.setLineDash([10, 10]); p.circle(s.x, s.y, s.r).stroke(2, '#7fe0ff'); ctx.setLineDash([]);
        for (let i = 0; i < 10; i++) {
          const a = t * 4 + (i / 10) * TAU, rr = ((t * 160 + i * 37) % s.r);
          ctx.globalAlpha = 0.7 * (rr / s.r);
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r - rr, a, a + 0.6); ctx.lineWidth = 3; ctx.strokeStyle = '#bff3ff'; ctx.stroke();
        }
        ctx.restore();
      }
      if (b.bossStorm) {
        const bs = b.bossStorm;
        ctx.save(); ctx.globalAlpha = bs.state === 'warn' ? 0.15 + 0.15 * Math.sin(t * 20) : 0.3;
        p.circle(bs.x, bs.y, 220).fill('#6fa8ff'); ctx.restore();
        ctx.save(); ctx.globalAlpha = 0.8; ctx.setLineDash([8, 8]); p.circle(bs.x, bs.y, 220).stroke(3, '#3c5aa8'); ctx.restore();
      }

      // props + units + projectiles, depth-sorted by y
      const drawables = [];
      for (const pr of b.props) drawables.push({ y: pr.y, f: () => this.drawProp(pr) });
      for (const u of b.units) if (u.alive) drawables.push({ y: u.y, f: () => this.drawUnit(b, u) });
      drawables.sort((a, c) => a.y - c.y);
      // shadows first
      for (const u of b.units) if (u.alive) { ctx.globalAlpha = 0.25; p.ell(u.x, u.y + u.r * (u.boss ? 0.95 : 1.15), u.r * 1.2, u.r * 0.42).fill('#000'); ctx.globalAlpha = 1; }
      for (const d of drawables) d.f();

      // beams
      for (const u of b.units) {
        if (!u.alive || !u.beam) continue;
        const tg = b.units.find((q) => q.uid === u.beam);
        if (!tg || !tg.alive) continue;
        ctx.save();
        ctx.beginPath(); ctx.moveTo(u.x + u.facing * u.r, u.y - u.r * 0.2);
        const n = 8;
        for (let i = 1; i <= n; i++) { const k = i / n; ctx.lineTo(u.x + (tg.x - u.x) * k + Math.sin(t * 30 + i) * 4, u.y - u.r * 0.2 + (tg.y - u.y) * k + Math.cos(t * 25 + i) * 4); }
        ctx.lineWidth = 3.5; ctx.strokeStyle = '#c99bff'; ctx.stroke(); ctx.restore();
      }

      for (const pj of b.projectiles) this.drawProjectile(pj);

      if (s.state === 'pull') {
        // big floating magnet over the storm centre
        ctx.save(); ctx.translate(s.x, s.y - 20 + Math.sin(t * 8) * 4); ctx.rotate(Math.sin(t * 6) * 0.15);
        ctx.beginPath(); ctx.arc(0, 0, 26, Math.PI, 0); ctx.lineWidth = 16; ctx.strokeStyle = '#d9534f'; ctx.stroke();
        ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(0, 0, 34, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 18, Math.PI, 0); ctx.stroke();
        p.rr(-34, -1, 16, 14, 2).both('#dfe7f2'); p.rr(18, -1, 16, 14, 2).both('#dfe7f2');
        ctx.restore();
      }

      // particles
      for (const pt of this.particles) {
        const k = pt.life / pt.max;
        if (pt.type === 'ring') {
          ctx.globalAlpha = k; p.circle(pt.x, pt.y, pt.maxR * (1 - k) + pt.r).stroke(4 * k + 1, pt.color);
        } else if (pt.type === 'zap') {
          ctx.globalAlpha = k; ctx.beginPath(); ctx.moveTo(pt.x1, pt.y1);
          for (let i = 1; i < 5; i++) ctx.lineTo(pt.x1 + (pt.x2 - pt.x1) * i / 5 + (Math.random() - 0.5) * 14, pt.y1 + (pt.y2 - pt.y1) * i / 5 + (Math.random() - 0.5) * 14);
          ctx.lineTo(pt.x2, pt.y2); ctx.lineWidth = 3; ctx.strokeStyle = pt.color || '#9be7ff'; ctx.stroke();
        } else if (pt.type === 'smoke') {
          ctx.globalAlpha = k * 0.8; p.circle(pt.x, pt.y, pt.size).fill(pt.color);
        } else if (pt.type === 'debris') {
          ctx.globalAlpha = Math.min(1, k * 2); ctx.save(); ctx.translate(pt.x, pt.y); ctx.rotate(pt.rot + (1 - k) * 8);
          ctx.fillStyle = pt.color; ctx.fillRect(-pt.size / 2, -pt.size / 2, pt.size, pt.size * 0.7); ctx.restore();
        } else {
          ctx.globalAlpha = k; p.circle(pt.x, pt.y, pt.size * k + 0.5).fill(pt.color);
        }
      }
      ctx.globalAlpha = 1;

      // floating texts
      ctx.textAlign = 'center';
      for (const tx of this.texts) {
        const k = tx.life / tx.max;
        const pop = k > 0.85 ? 1 + (k - 0.85) * 3 : 1;
        ctx.globalAlpha = Math.min(1, k * 2.5);
        ctx.font = `900 ${Math.round(tx.size * pop)}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
        ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeText(tx.str, tx.x, tx.y);
        ctx.fillStyle = tx.color; ctx.fillText(tx.str, tx.x, tx.y);
      }
      ctx.globalAlpha = 1;

      // speech bubbles
      for (const q of this.bubbles) {
        const u = b.units.find((x) => x.uid === q.uid);
        if (!u || !u.alive) continue;
        ctx.font = '600 13px system-ui, sans-serif';
        const w = Math.min(220, ctx.measureText(q.text).width + 16);
        const bx = Math.max(w / 2 + 4, Math.min(W - w / 2 - 4, u.x)), by = Math.max(30, u.y - u.r - 44);
        ctx.globalAlpha = Math.min(1, q.life * 3);
        p.rr(bx - w / 2, by - 14, w, 24, 10).both('#fffdf5', 2);
        p.poly([u.x - 5, by + 9, u.x + 5, by + 9, u.x, by + 18]).fill('#fffdf5');
        ctx.fillStyle = INK; ctx.fillText(q.text, bx, by + 3, 210);
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.35})`; ctx.fillRect(0, 0, this.cssW, this.cssH); }
    }

    drawProp(pr) {
      const ctx = this.ctx, p = P(ctx);
      ctx.save(); ctx.translate(pr.x, pr.y); ctx.rotate(pr.rot);
      const fast = Math.hypot(pr.vx, pr.vy) > 200;
      if (fast) { ctx.globalAlpha = 0.35; p.circle(0, 0, pr.r * 1.6).fill(pr.owner === 0 ? '#7fe0ff' : '#ff9a3a'); ctx.globalAlpha = 1; }
      if (pr.kind === 'cog') gear(ctx, pr.r, '#8c97a3');
      else if (pr.kind === 'pan') { p.circle(0, 0, pr.r * 0.85).both('#5f6a75'); p.rr(pr.r * 0.7, -3, pr.r, 6, 2).both('#3b2b20'); }
      else if (pr.kind === 'tire') { p.circle(0, 0, pr.r).both('#2b2b33'); p.circle(0, 0, pr.r * 0.45).both('#7a6a5a', 2); }
      else if (pr.kind === 'anvil') {
        ctx.rotate(-pr.rot * 0.85); // anvils mostly stay upright so they read as anvils
        p.poly([-pr.r * 0.9, -pr.r * 0.55, pr.r * 0.7, -pr.r * 0.55, pr.r * 1.25, -pr.r * 0.45, pr.r * 0.7, -pr.r * 0.1, pr.r * 0.35, -pr.r * 0.1, pr.r * 0.35, pr.r * 0.35, pr.r * 0.75, pr.r * 0.7, -pr.r * 0.75, pr.r * 0.7, -pr.r * 0.35, pr.r * 0.35, -pr.r * 0.35, -pr.r * 0.1, -pr.r * 0.9, -pr.r * 0.1]).both('#5b616b');
        p.line(-pr.r * 0.8, -pr.r * 0.45, pr.r * 0.6, -pr.r * 0.45, 2, '#9aa3ad');
      }
      else if (pr.kind === 'barrel') {
        const lit = pr.fuse != null;
        p.rr(-pr.r * 0.8, -pr.r, pr.r * 1.6, pr.r * 2, 5).both(lit && Math.sin(this.time * 40) > 0 ? '#fff' : '#d9534f');
        p.line(-pr.r * 0.8, -pr.r * 0.35, pr.r * 0.8, -pr.r * 0.35, 2); p.line(-pr.r * 0.8, pr.r * 0.35, pr.r * 0.8, pr.r * 0.35, 2);
        ctx.fillStyle = '#ffd84a'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', 0, 4);
      }
      ctx.restore();
    }

    drawProjectile(pj) {
      const ctx = this.ctx, p = P(ctx);
      if (pj.lob) {
        ctx.globalAlpha = 0.3; p.ell(pj.tx, pj.ty, pj.splash * 0.4 * pj.k, pj.splash * 0.2 * pj.k).fill('#000'); ctx.globalAlpha = 1;
        ctx.save(); ctx.translate(pj.x, pj.y); ctx.rotate(pj.t * 10);
        if (pj.kind === 'barrel') { p.rr(-14, -18, 28, 36, 6).both('#a86a3b'); p.line(-14, -6, 14, -6, 2.5); p.line(-14, 6, 14, 6, 2.5); }
        else if (pj.kind === 'fireball') { ctx.globalAlpha = 0.35; p.circle(0, 0, 18).fill('#ff7b2e'); ctx.globalAlpha = 1; p.circle(0, 0, 11).both('#ff9a3a'); p.circle(0, 0, 5).fill('#fff2a8'); }
        else { p.circle(0, 0, 8).both('#2b2b33'); p.line(0, -8, 4, -13, 2, '#c9a35a'); p.circle(4, -14, 2.5).fill('#ffd84a'); }
        ctx.restore();
        return;
      }
      const a = Math.atan2(pj.vy, pj.vx);
      ctx.save(); ctx.translate(pj.x, pj.y); ctx.rotate(a);
      if (pj.kind === 'shock') { ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(-6, 0, 14, -1.1, 1.1); ctx.lineWidth = 5; ctx.strokeStyle = '#fff6b0'; ctx.stroke(); ctx.globalAlpha = 1; }
      else if (pj.kind === 'magbolt') { ctx.globalAlpha = 0.35; p.circle(0, 0, 14).fill('#6fa8ff'); ctx.globalAlpha = 1; p.circle(0, 0, 8).both('#9cc4ff', 2); }
      else if (pj.kind === 'dart') { p.line(-9, 0, 7, 0, 2.5, '#6b4a2f'); p.poly([7, -3, 13, 0, 7, 3]).fill('#dfe7f2'); p.poly([-9, 0, -13, -4, -11, 0, -13, 4]).fill('#b56cff'); }
      else { p.line(-10, 0, 8, 0, 3, '#5a3d2b'); p.poly([8, -4, 15, 0, 8, 4]).fill('#c8cdd4'); }
      ctx.restore();
    }

    drawUnit(b, u) {
      const ctx = this.ctx, p = P(ctx), t = this.time;
      const flashing = u.anim.hit > 0.9 || (u.st.invuln > 0 && Math.sin(t * 40) > 0);
      const c = !flashing ? (x) => x : u.boss || u.r > 26 ? (x) => mix(x, '#ffffff', 0.45) : () => '#ffffff';
      const moving = Math.hypot(u.vx, u.vy) > 60;
      const bob = Math.sin(u.anim.walk) * 1.8;
      ctx.save();
      ctx.translate(u.x, u.y + bob);
      // knockback tumble + squash
      if (moving && !u.boss) ctx.rotate(Math.sin(t * 25) * 0.35);
      const squash = 1 + u.anim.hit * 0.12;
      const vis = u.boss ? 1.15 : 1.4; // art is drawn larger than the collision circle so it reads on phones
      ctx.scale(u.facing * (vis / squash), vis * squash);
      ctx.translate(u.anim.atk * 4, 0);
      if (u.team === 0 && !u.companion) { ctx.globalAlpha = 0.75; P(ctx).ell(0, u.r * 0.85, u.r * 1.05, u.r * 0.4).stroke(2.5, '#4ff0ff'); ctx.globalAlpha = 1; }
      else if (u.team === 1) { ctx.globalAlpha = u.tauntBy ? 0.8 : 0.45; P(ctx).ell(0, u.r * 0.85, u.r, u.r * 0.35).stroke(2, '#ff6b5a'); ctx.globalAlpha = 1; }
      if (u.elite) { ctx.globalAlpha = 0.28 + Math.sin(t * 6) * 0.1; P(ctx).circle(0, 0, u.r * 1.25).fill(SB.ELITES[u.elite].color); ctx.globalAlpha = 1; }
      (BODIES[u.id] || BODIES.rat)(ctx, u.r, u.anim, c, t + u.uid);
      ctx.restore();

      // status effects
      if (u.shieldHp > 0) { ctx.globalAlpha = 0.3; p.circle(u.x, u.y, u.r * 1.5).both('#9cc4ff', 2); ctx.globalAlpha = 1; }
      if (u.st.shield > 0) { ctx.globalAlpha = 0.35 + 0.1 * Math.sin(t * 8); p.circle(u.x, u.y, u.r + 10).both('#9cc4ff', 2); ctx.globalAlpha = 1; }
      if (u.st.stun > 0) for (let i = 0; i < 3; i++) { const a = t * 6 + i * 2.1; star(ctx, u.x + Math.cos(a) * u.r * 0.8, u.y - u.r * 1.3 + Math.sin(a) * 5, 5, '#ffd84a'); }
      if (u.st.confuse > 0) { ctx.font = '900 18px system-ui'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeText('?', u.x, u.y - u.r * 1.5); ctx.fillStyle = '#f3d27a'; ctx.fillText('?', u.x, u.y - u.r * 1.5); }
      if (u.st.curse > 0 && Math.random() < 0.3) this.particles.push({ x: u.x + (Math.random() - 0.5) * u.r, y: u.y, vx: 0, vy: -40, life: 0.6, max: 0.6, size: 3, color: '#b56cff', type: 'spark' });
      if (u.st.root > 0) { p.circle(u.x, u.y + u.r * 0.6, u.r * 0.7).stroke(3, '#dfe7f2'); }

      // health bar (bosses get the big bar in the HUD)
      if (!u.boss) {
        const w = Math.max(30, u.r * 2), x = u.x - w / 2, y = u.y - u.r * (u.id === 'knight' || u.id === 'trickster' ? 2.6 : 2.0) - 8;
        if (u.elite) {
          ctx.font = '900 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = INK;
          ctx.strokeText(SB.ELITES[u.elite].name, u.x, y - 4); ctx.fillStyle = SB.ELITES[u.elite].color; ctx.fillText(SB.ELITES[u.elite].name, u.x, y - 4);
        }
        p.rr(x - 1.5, y - 1.5, w + 3, 8, 3).fill(INK);
        p.rr(x, y, w * Math.max(0, u.hp / u.maxHp), 5, 2).fill(u.team === 0 ? '#5fd068' : '#ff5a4f');
        if (u.team === 0 && u.special) {
          p.rr(x, y + 7, w * u.charge, 3, 1).fill(u.charge >= 1 ? '#ffe14a' : '#7fe0ff');
          if (u.charge >= 1) { ctx.font = '900 14px system-ui'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeText('!', u.x, y - 6); ctx.fillStyle = '#ffe14a'; ctx.fillText('!', u.x, y - 6); }
        }
      }
    }
  }

  function drawPress(ctx, x, y, r, alpha) {
    const p = P(ctx);
    ctx.save(); ctx.globalAlpha = alpha;
    p.rr(x - 10, y - r - 60, 20, 60, 3).both('#5f6a75');
    p.rr(x - r, y - r, r * 2, r * 1.6, 10).both('#6d7a86', 3);
    ctx.save(); p.rr(x - r, y + r * 0.35, r * 2, r * 0.3, 4); ctx.clip();
    for (let i = -6; i < 8; i++) { ctx.fillStyle = i % 2 ? '#ffd84a' : '#1d1a24'; ctx.beginPath(); ctx.moveTo(x - r + i * 16, y + r * 0.35); ctx.lineTo(x - r + i * 16 + 16, y + r * 0.35); ctx.lineTo(x - r + i * 16 + 6, y + r * 0.7); ctx.lineTo(x - r + i * 16 - 10, y + r * 0.7); ctx.fill(); }
    ctx.restore();
    p.rr(x - r, y + r * 0.35, r * 2, r * 0.3, 4).stroke(3);
    ctx.font = '900 16px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#1d1a24'; ctx.fillText('10 TON', x, y + 2);
    ctx.restore();
  }
  function shade(hex, k) { return k < 0 ? mix(hex, '#000000', -k) : mix(hex, '#ffffff', k); }
  // Distant junk-pile silhouettes above the arena on tall screens.
  function drawSkyline(ctx, w, h, arena, sc) {
    if (h < 30) return;
    const rng = SB.makeRng(arena.id.length * 31 + 7);
    ctx.save();
    ctx.fillStyle = shade(arena.ground2, -0.3);
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w + 40; x += 30 + rng() * 30) ctx.lineTo(x, h - (10 + rng() * Math.min(70, h * 0.6)));
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(arena.ground2, -0.5);
    for (let i = 0; i < 8; i++) { const x = rng() * w, y = h - rng() * Math.min(40, h * 0.4); ctx.beginPath(); ctx.arc(x, y, (4 + rng() * 6) * Math.max(1, sc), 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  const mixCache = new Map();
  function mix(hex, to, k) {
    const key = hex + to + k;
    if (mixCache.has(key)) return mixCache.get(key);
    const h = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
    let out = hex;
    if (/^#[0-9a-f]{6}$/i.test(hex)) { const a = h(hex), c = h(to); out = '#' + a.map((v, i) => Math.round(v + (c[i] - v) * k).toString(16).padStart(2, '0')).join(''); }
    mixCache.set(key, out);
    return out;
  }
  function gear(ctx, r, color) {
    const p = P(ctx);
    ctx.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, rr = i % 2 ? r : r * 0.72; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); p.both(color, 2);
    p.circle(0, 0, r * 0.3).both('#3b3b44', 1.5);
  }
  function star(ctx, x, y, r, color) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke();
  }

  SB.Renderer = Renderer;
})();
