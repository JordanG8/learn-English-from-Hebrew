"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { AVATAR_STYLES, WORLD_ZONES } from "@/lib/game-world";

function AdventureScene({ zoneIndex, avatarColour, casting }: { zoneIndex: number; avatarColour: string; casting: boolean }) {
  const host = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const zone = WORLD_ZONES[zoneIndex]!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(zone.sky);
    scene.fog = new THREE.Fog(zone.sky, 12, 28);
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    camera.position.set(0, 7.5, 13);
    camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    element.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, zone.ground, 2.3));
    const sun = new THREE.DirectionalLight(0xffffff, 3.2);
    sun.position.set(6, 11, 5); sun.castShadow = true; scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(18, 64), new THREE.MeshStandardMaterial({ color: zone.ground, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

    const path = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 25), new THREE.MeshStandardMaterial({ color: "#f7e5bd", roughness: 1 }));
    path.rotation.x = -Math.PI / 2; path.position.y = 0.02; path.receiveShadow = true; scene.add(path);
    const hero = new THREE.Group();
    const heroMaterial = new THREE.MeshStandardMaterial({ color: avatarColour, roughness: 0.55 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.72, 1.25, 8, 16), heroMaterial);
    body.position.y = 1.2; body.castShadow = true; hero.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.58, 24, 16), new THREE.MeshStandardMaterial({ color: "#ffd1ae", roughness: 0.8 }));
    head.position.y = 2.48; head.castShadow = true; hero.add(head); hero.position.set(-2.9, 0, 1.5); scene.add(hero);
    const monster = new THREE.Group();
    const monsterBody = new THREE.Mesh(new THREE.DodecahedronGeometry(1.15, 0), new THREE.MeshStandardMaterial({ color: "#4a355e", roughness: 0.45, emissive: "#20102b", emissiveIntensity: 0.55 }));
    monsterBody.castShadow = true; monster.add(monsterBody);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), new THREE.MeshBasicMaterial({ color: "#fff4ab" }));
    eye.position.set(0, 0.2, 1.06); monster.add(eye); monster.position.set(3.7, 1.35, -0.5); scene.add(monster);
    const rune = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.12, 14, 30), new THREE.MeshStandardMaterial({ color: zone.colour, emissive: zone.colour, emissiveIntensity: 0.4 }));
    rune.rotation.x = Math.PI / 2; rune.position.set(0, 0.22, 0); scene.add(rune);
    const spellMaterial = new THREE.MeshBasicMaterial({ color: "#fff2a8", transparent: true, opacity: 0 });
    const spell = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 16), spellMaterial); scene.add(spell);
    const trees = new THREE.Group();
    for (let i = 0; i < 16; i++) { const angle = (i / 16) * Math.PI * 2; const radius = 8 + (i % 3); const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.23, 1.4, 8), new THREE.MeshStandardMaterial({ color: "#76533a" })); const crown = new THREE.Mesh(new THREE.ConeGeometry(0.95 + (i % 2) * 0.22, 2.5, 8), new THREE.MeshStandardMaterial({ color: i % 2 ? "#4f9f66" : "#65b978" })); trunk.position.set(Math.cos(angle) * radius, 0.7, Math.sin(angle) * radius); crown.position.copy(trunk.position); crown.position.y += 1.75; trunk.castShadow = crown.castShadow = true; trees.add(trunk, crown); }
    scene.add(trees);
    let frame = 0; const started = performance.now();
    const resize = () => { const w = element.clientWidth, h = element.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    resize(); const observer = new ResizeObserver(resize); observer.observe(element);
    const animate = (now: number) => { frame = requestAnimationFrame(animate); const t = (now - started) / 1000; monster.position.y = 1.35 + Math.sin(t * 2.3) * 0.2; monster.rotation.y = t * 0.55; rune.rotation.z = t * 0.85; hero.rotation.y = Math.sin(t * 1.4) * 0.12; if (casting) { const p = (t * 2.8) % 1; spellMaterial.opacity = 1 - p; spell.position.lerpVectors(hero.position.clone().add(new THREE.Vector3(0.8, 2.1, -0.2)), monster.position, p); monster.scale.setScalar(1 + Math.sin(t * 16) * 0.035); } else { spellMaterial.opacity = 0; monster.scale.setScalar(1); } renderer.render(scene, camera); };
    frame = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); renderer.dispose(); element.removeChild(renderer.domElement); scene.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); const material = object.material; if (Array.isArray(material)) material.forEach((m) => m.dispose()); else material.dispose(); } }); };
  }, [zoneIndex, avatarColour, casting]);
  return <div ref={host} className="h-[48dvh] min-h-[360px] w-full overflow-hidden rounded-[2rem] border-4 border-white/70 shadow-xl" aria-label="תצוגת עולם ההרפתקה" />;
}

export function WorldLab() {
  const [zoneIndex, setZoneIndex] = useState(0); const [avatar, setAvatar] = useState(0); const [casting, setCasting] = useState(false);
  const zone = WORLD_ZONES[zoneIndex]!;
  const cast = () => { setCasting(true); window.setTimeout(() => setCasting(false), 1450); };
  return <main className="min-h-dvh px-4 py-6 md:px-8" dir="rtl">
    <header className="mx-auto max-w-6xl"><p className="text-sm font-black text-ink-soft">ALPHA · WORLD LAB</p><h1 className="mt-1 text-4xl font-black md:text-5xl">מעבדת עולם ההרפתקה</h1><p className="mt-3 max-w-2xl text-lg text-ink-soft">מקום אחד שבו אנחנו בוחנים אזורים, גיבורים, אויבים, קסמים ופרסים — לפני שהם נכנסים לשיעורים אמיתיים.</p><Link href="/adventure/letter-grove" className="btn-primary mt-5 inline-grid place-items-center">✨ שחקו במשימת חורשת האותיות</Link></header>
    <section className="mx-auto mt-6 grid max-w-6xl gap-5 lg:grid-cols-[1fr_330px]"><AdventureScene zoneIndex={zoneIndex} avatarColour={AVATAR_STYLES[avatar]!.colour} casting={casting} /><aside className="rounded-[2rem] bg-card p-5 shadow-lg"><h2 className="text-2xl font-black">{zone.titleHe}</h2><p className="mt-1 text-ink-soft">{zone.subtitleHe}</p><div className="mt-5 space-y-2"><p className="text-sm font-black text-ink-soft">אזור</p>{WORLD_ZONES.map((item, index) => <button key={item.id} type="button" onClick={() => setZoneIndex(index)} className={`w-full rounded-2xl px-4 py-3 text-right font-black ${index === zoneIndex ? "text-white shadow" : "bg-paper text-ink"}`} style={index === zoneIndex ? { background: item.colour } : undefined}>{item.titleHe}</button>)}</div><div className="mt-5 rounded-2xl bg-paper p-4"><p className="font-black">{zone.monster.emoji} {zone.monster.nameHe}</p><p className="mt-1 text-sm text-ink-soft">נחלש באמצעות: {zone.monster.weaknessHe}</p><p className="mt-2 text-sm font-bold">פרס: {zone.reward.emoji} {zone.reward.nameHe}</p></div></aside></section>
    <section className="mx-auto mt-5 grid max-w-6xl gap-5 md:grid-cols-2"><div className="rounded-[2rem] bg-card p-5 shadow"><h2 className="text-2xl font-black">הגיבור שלי</h2><p className="mt-1 text-ink-soft">הבחירה הזו תהפוך בהמשך לצבעי שריון, אביזרים וחיות-לוויה.</p><div className="mt-4 flex gap-3">{AVATAR_STYLES.map((style, index) => <button key={style.id} type="button" onClick={() => setAvatar(index)} aria-pressed={avatar === index} className="grid h-16 w-16 place-items-center rounded-full border-4 border-white shadow" style={{ background: style.colour }}><span className="sr-only">{style.labelHe}</span>{avatar === index ? "✓" : ""}</button>)}</div></div><div className="rounded-[2rem] bg-card p-5 shadow"><h2 className="text-2xl font-black">בדיקת קסם</h2><p className="mt-1 text-ink-soft">במשחק האמיתי, תשובה נכונה מפעילה קסם קצר ומוחשי — ולא רק מסך ״נכון״.</p><button type="button" onClick={cast} className="btn-primary mt-4 w-full">🪄 הטילו קסם של מילה</button></div></section>
  </main>;
}
