import {
  Activity, ArrowLeft, ArrowRight, Bell, Bold, Camera, ChartColumn, Check, ChevronDown, ChevronLeft,
  ChevronRight, CircleCheck, CircleHelp, Clock, Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow,
  CloudSun, Copy, Drama, ExternalLink, Eye, EyeOff, FileText, Filter, Flame, Heading2, History, House,
  Image, ImagePlus, Inbox, Info, Italic, KeyRound, Layers, LayoutPanelTop, Link, List, ListOrdered,
  Loader, LogOut, Mail, MapPin, Megaphone, Menu, MessageSquareText, Newspaper, PenLine, Pencil, Play,
  Plus, Quote, RefreshCw, ScrollText, Search, Send, Settings, Share2, Shield, ShieldCheck, Smartphone,
  Sparkles, Star, Sun, Tag, Trash2, Trophy, TriangleAlert, Undo2, Upload, User, Users, Video, X,
  School, Calendar, Save, Lock, Pause, Heart, Palette,
} from 'lucide-preact';
import type { LucideIcon } from 'lucide-preact';

const icons = {
  activity: Activity, 'arrow-left': ArrowLeft, 'arrow-right': ArrowRight, bell: Bell, bold: Bold,
  camera: Camera, chart: ChartColumn, check: Check, 'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft, 'chevron-right': ChevronRight, 'circle-check': CircleCheck,
  help: CircleHelp, clock: Clock, cloud: Cloud, fog: CloudFog, storm: CloudLightning,
  rain: CloudRain, snow: CloudSnow, 'cloud-sun': CloudSun, copy: Copy, masks: Drama,
  external: ExternalLink, eye: Eye, 'eye-off': EyeOff, file: FileText, filter: Filter, flame: Flame,
  heading: Heading2, history: History, home: House, image: Image, 'image-plus': ImagePlus,
  inbox: Inbox, info: Info, italic: Italic, key: KeyRound, layers: Layers, layout: LayoutPanelTop,
  link: Link, list: List, 'list-ordered': ListOrdered, loader: Loader, logout: LogOut, mail: Mail,
  pin: MapPin, megaphone: Megaphone, menu: Menu, message: MessageSquareText, newspaper: Newspaper,
  pen: PenLine, pencil: Pencil, play: Play, plus: Plus, quote: Quote, refresh: RefreshCw,
  scroll: ScrollText, search: Search, send: Send, settings: Settings, share: Share2,
  shield: Shield, 'shield-check': ShieldCheck, phone: Smartphone, sparkles: Sparkles, star: Star,
  sun: Sun, tag: Tag, trash: Trash2, trophy: Trophy, warning: TriangleAlert, undo: Undo2,
  upload: Upload, user: User, users: Users, video: Video, x: X, school: School, calendar: Calendar,
  save: Save, lock: Lock, pause: Pause, heart: Heart, palette: Palette,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof icons;

export function Icon({ name, size = 18, class: cls, strokeWidth = 2 }: {
  name: string; size?: number; class?: string; strokeWidth?: number;
}) {
  const Cmp = (icons as Record<string, LucideIcon>)[name] ?? Newspaper;
  return <Cmp size={size} strokeWidth={strokeWidth} class={cls} aria-hidden="true" />;
}
