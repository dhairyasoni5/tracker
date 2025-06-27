import { ArrowRight, ChevronLeft, Locate, MapPin, Search, Settings, Star, Wifi, X, ZoomIn, ZoomOut } from 'lucide-react';
import React, { useEffect, useState } from 'react';

// Mock SVG floor plan (simple rooms)
const ROOMS = [
  { id: 'room1', name: 'Conference Room', x: 40, y: 60, w: 80, h: 60, amenities: ['Projector', 'Whiteboard'] },
  { id: 'room2', name: 'Lobby', x: 140, y: 40, w: 60, h: 40, amenities: ['Reception'] },
  { id: 'room3', name: 'Breakout', x: 220, y: 80, w: 60, h: 40, amenities: ['Coffee', 'Snacks'] },
  { id: 'room4', name: 'Restroom', x: 60, y: 140, w: 40, h: 30, amenities: ['Accessible'] },
];

const ROOM_COLORS = {
  default: 'fill-slate-200 dark:fill-slate-700',
  highlight: 'fill-blue-400 dark:fill-blue-600',
  selected: 'fill-purple-500 dark:fill-purple-700',
  path: 'fill-green-300 dark:fill-green-600',
};

const mockTrail = [
  { x: 60, y: 80 },
  { x: 100, y: 90 },
  { x: 130, y: 70 },
];

const mockDest = { id: 'room3', name: 'Breakout', x: 250, y: 100 };

function getRoomByCoords(x, y) {
  return ROOMS.find(
    (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
  );
}

const IndoorMapLiveTracker = ({ isOpen = true, onClose }) => {
  // State
  const [currentRoom, setCurrentRoom] = useState('room1');
  const [accuracy, setAccuracy] = useState('high');
  const [isConnected, setIsConnected] = useState(true);
  const [destination, setDestination] = useState(null);
  const [showingDetails, setShowingDetails] = useState(false);
  const [userPos, setUserPos] = useState({ x: 80, y: 90 });
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [favorites, setFavorites] = useState([]);
  const [zoom, setZoom] = useState(1);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [darkMode, setDarkMode] = useState(false);
  const [statusMsg, setStatusMsg] = useState('Connected');
  const [showSettings, setShowSettings] = useState(false);
  const [showTrail, setShowTrail] = useState(true);
  const [trail, setTrail] = useState(mockTrail);
  const [showInfo, setShowInfo] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Simulate real-time location updates
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      // Move user to a random nearby point
      setUserPos((pos) => {
        let nx = pos.x + (Math.random() - 0.5) * 10;
        let ny = pos.y + (Math.random() - 0.5) * 10;
        nx = Math.max(40, Math.min(280, nx));
        ny = Math.max(40, Math.min(160, ny));
        setLastUpdate(Date.now());
        setTrail((t) => [...t.slice(-9), { x: nx, y: ny }]);
        const room = getRoomByCoords(nx, ny);
        if (room) setCurrentRoom(room.id);
        setAccuracy(['high', 'medium', 'low'][Math.floor(Math.random() * 3)]);
        return { x: nx, y: ny };
      });
    }, 2500);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Accessibility: reduced motion
  useEffect(() => {
    if (window && window.matchMedia) {
      setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
  }, []);

  // Color helpers
  const getRoomColor = (room) => {
    if (destination && room.id === destination.id) return ROOM_COLORS.path;
    if (room.id === currentRoom) return ROOM_COLORS.selected;
    return ROOM_COLORS.default;
  };

  // Status bar
  const statusColor = isConnected ? (accuracy === 'high' ? 'bg-green-500' : accuracy === 'medium' ? 'bg-yellow-400' : 'bg-orange-500') : 'bg-red-500';
  const statusText = isConnected ? (accuracy === 'high' ? 'Excellent' : accuracy === 'medium' ? 'Good' : 'Poor') : 'Offline';

  // Room click handler
  const handleRoomClick = (room) => {
    setShowingDetails(true);
    setDestination(room);
  };

  // Search
  const filteredRooms = ROOMS.filter((r) => r.name.toLowerCase().includes(searchTerm.toLowerCase()));

  // Favorite
  const toggleFavorite = (roomId) => {
    setFavorites((f) => f.includes(roomId) ? f.filter((id) => id !== roomId) : [...f, roomId]);
  };

  // Glassmorphism + gradient bg
  return isOpen ? (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-blue-900/80 to-purple-900/80 transition-colors duration-500 ${darkMode ? 'dark' : ''}`}
      aria-modal="true" role="dialog" tabIndex={-1}
    >
      {/* Map Container */}
      <div className="relative w-full max-w-md mx-auto h-[90vh] rounded-3xl shadow-2xl bg-white/60 dark:bg-slate-900/70 backdrop-blur-lg border border-white/20 flex flex-col overflow-hidden">
        {/* Close Button */}
        <button
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/70 dark:bg-slate-800/70 hover:bg-white/90 dark:hover:bg-slate-700/90 shadow-lg transition"
          aria-label="Close map"
          onClick={onClose}
        >
          <X className="w-5 h-5 text-slate-700 dark:text-slate-200" />
        </button>
        {/* Status Bar */}
        <div className="flex items-center justify-between px-6 py-2 bg-white/40 dark:bg-slate-800/40 backdrop-blur border-b border-white/20">
          <div className="flex items-center gap-2">
            <Wifi className={`w-4 h-4 ${statusColor}`} aria-label="Connection status" />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{statusText} signal</span>
            <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{isConnected ? 'Live' : 'Offline'}</span>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">{new Date(lastUpdate).toLocaleTimeString()}</span>
        </div>
        {/* SVG Floor Plan */}
        <div className="relative flex-1 flex items-center justify-center bg-gradient-to-br from-blue-100/60 to-purple-100/60 dark:from-blue-950/60 dark:to-purple-950/60">
          <svg
            viewBox="0 0 320 200"
            className="w-[95%] h-[90%] drop-shadow-xl"
            aria-label="Indoor map floor plan"
          >
            {/* Rooms */}
            {ROOMS.map((room) => (
              <rect
                key={room.id}
                x={room.x}
                y={room.y}
                width={room.w}
                height={room.h}
                rx={12}
                className={`cursor-pointer transition-all duration-300 ${getRoomColor(room)} ${destination && room.id === destination.id ? 'stroke-4 stroke-green-400' : ''}`}
                onClick={() => handleRoomClick(room)}
                aria-label={room.name}
                tabIndex={0}
              />
            ))}
            {/* Room labels */}
            {ROOMS.map((room) => (
              <text
                key={room.id + '-label'}
                x={room.x + room.w / 2}
                y={room.y + room.h / 2 + 4}
                textAnchor="middle"
                className="select-none pointer-events-none font-bold text-xs fill-slate-700 dark:fill-slate-200"
                aria-hidden="true"
              >
                {room.name}
              </text>
            ))}
            {/* User trail */}
            {showTrail && trail.map((pt, i) => (
              <circle
                key={i}
                cx={pt.x}
                cy={pt.y}
                r={4 - i * 0.3}
                className="fill-blue-300/40 dark:fill-blue-600/40"
              />
            ))}
            {/* User position marker */}
            <g>
              <circle
                cx={userPos.x}
                cy={userPos.y}
                r={accuracy === 'high' ? 14 : accuracy === 'medium' ? 22 : 32}
                className={`transition-all duration-500 ${accuracy === 'high' ? 'fill-green-300/40' : accuracy === 'medium' ? 'fill-yellow-200/40' : 'fill-orange-200/40'}`}
                aria-label="Position accuracy"
              />
              <circle
                cx={userPos.x}
                cy={userPos.y}
                r={8}
                className="fill-blue-600 animate-pulse"
                aria-label="Your location"
              />
              {/* Direction indicator (arrow) */}
              <polygon
                points={`${userPos.x},${userPos.y - 14} ${userPos.x - 4},${userPos.y - 6} ${userPos.x + 4},${userPos.y - 6}`}
                className="fill-blue-700 dark:fill-blue-300"
                aria-label="Direction"
              />
            </g>
            {/* Destination marker */}
            {destination && (
              <g>
                <circle
                  cx={destination.x + 20}
                  cy={destination.y + 10}
                  r={10}
                  className="fill-purple-400 animate-bounce"
                />
                <ArrowRight
                  x={destination.x + 20}
                  y={destination.y + 10}
                  className="w-4 h-4 text-purple-700"
                />
              </g>
            )}
          </svg>
          {/* Floating Info Card */}
          {showingDetails && destination && (
            <div className="absolute left-1/2 top-8 -translate-x-1/2 z-20 w-11/12 max-w-xs bg-white/90 dark:bg-slate-900/90 rounded-2xl shadow-xl p-4 flex flex-col gap-2 border border-white/30 backdrop-blur-lg animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-purple-500" />
                  <span className="font-bold text-slate-800 dark:text-slate-100 text-base">{destination.name}</span>
                </div>
                <button onClick={() => setShowingDetails(false)} aria-label="Close info card" className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mt-1">
                {destination.amenities?.map((a) => (
                  <span key={a} className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 px-2 py-0.5 rounded text-xs font-medium">{a}</span>
                ))}
              </div>
              <button
                className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold text-sm shadow hover:scale-105 transition"
                onClick={() => setDestination(null)}
              >
                <ArrowRight className="w-4 h-4" /> Navigate here
              </button>
              <button
                className="mt-1 flex items-center gap-2 px-2 py-1 rounded-lg bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-200 text-xs font-semibold hover:bg-yellow-200 dark:hover:bg-yellow-800 transition"
                onClick={() => toggleFavorite(destination.id)}
              >
                <Star className={`w-4 h-4 ${favorites.includes(destination.id) ? 'fill-yellow-400' : ''}`} />
                {favorites.includes(destination.id) ? 'Remove from Favorites' : 'Add to Favorites'}
              </button>
            </div>
          )}
        </div>
        {/* Control Panel (FABs) */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 z-20">
          <button className="p-3 rounded-full bg-white/80 dark:bg-slate-800/80 shadow-lg hover:scale-110 transition" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(2, z + 0.1))}><ZoomIn className="w-5 h-5" /></button>
          <button className="p-3 rounded-full bg-white/80 dark:bg-slate-800/80 shadow-lg hover:scale-110 transition" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}><ZoomOut className="w-5 h-5" /></button>
          <button className="p-3 rounded-full bg-white/80 dark:bg-slate-800/80 shadow-lg hover:scale-110 transition" aria-label="Center on user" onClick={() => setUserPos({ x: 80, y: 90 })}><Locate className="w-5 h-5" /></button>
          <button className="p-3 rounded-full bg-white/80 dark:bg-slate-800/80 shadow-lg hover:scale-110 transition" aria-label="Toggle trail" onClick={() => setShowTrail((v) => !v)}><ChevronLeft className="w-5 h-5" /></button>
          <button className="p-3 rounded-full bg-white/80 dark:bg-slate-800/80 shadow-lg hover:scale-110 transition" aria-label="Settings" onClick={() => setShowSettings((v) => !v)}><Settings className="w-5 h-5" /></button>
        </div>
        {/* Search Bar */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-10/12 max-w-xs z-20">
          <div className="flex items-center bg-white/80 dark:bg-slate-800/80 rounded-xl shadow px-3 py-2 gap-2">
            <Search className="w-4 h-4 text-slate-500" />
            <input
              type="text"
              className="flex-1 bg-transparent outline-none text-slate-800 dark:text-slate-100 text-sm"
              placeholder="Search rooms..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search rooms"
            />
          </div>
          {searchTerm && (
            <div className="absolute left-0 right-0 mt-1 bg-white dark:bg-slate-900 rounded-xl shadow-lg max-h-40 overflow-auto z-30">
              {filteredRooms.length === 0 ? (
                <div className="p-3 text-slate-500 text-sm">No rooms found.</div>
              ) : (
                filteredRooms.map((room) => (
                  <button
                    key={room.id}
                    className="w-full text-left px-4 py-2 hover:bg-blue-100 dark:hover:bg-blue-900 text-slate-800 dark:text-slate-100 text-sm"
                    onClick={() => { setDestination(room); setShowingDetails(true); setSearchTerm(''); }}
                  >
                    {room.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        {/* Settings Panel */}
        {showSettings && (
          <div className="absolute right-6 bottom-28 w-64 bg-white/90 dark:bg-slate-900/90 rounded-2xl shadow-xl p-4 border border-white/30 backdrop-blur-lg animate-fade-in z-30">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-slate-800 dark:text-slate-100">Settings</span>
              <button onClick={() => setShowSettings(false)} aria-label="Close settings" className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={darkMode} onChange={() => setDarkMode((v) => !v)} />
                <span className="text-sm">Dark mode</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showTrail} onChange={() => setShowTrail((v) => !v)} />
                <span className="text-sm">Show trail</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={reducedMotion} onChange={() => setReducedMotion((v) => !v)} />
                <span className="text-sm">Reduced motion</span>
              </label>
            </div>
          </div>
        )}
        {/* Status Message */}
        {statusMsg && (
          <div className="absolute left-1/2 bottom-4 -translate-x-1/2 bg-gradient-to-r from-green-400 to-blue-500 text-white px-4 py-2 rounded-full shadow-lg text-xs font-semibold animate-fade-in z-40">
            {statusMsg}
          </div>
        )}
      </div>
    </div>
  ) : null;
};

export default IndoorMapLiveTracker; 