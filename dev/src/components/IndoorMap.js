import React, { useRef, useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, TextInput, FlatList } from 'react-native';
import Svg, { G, Path, Rect, Circle, Text as SvgText, Polyline, Polygon } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { ROOM_DOT_POSITIONS } from './RoomDotPositions';

// Helper: status color
const getStatusColor = (student) => {
  // Use lastRoomUpdate for real-time status
  const lastUpdate = new Date(student.lastRoomUpdate || student.timestamp || 0);
  const now = new Date();
  const diff = (now - lastUpdate) / 1000; // seconds
  if (!isNaN(lastUpdate) && diff < 300) return '#166534'; // Online: dark green (<5 min)
  if (!isNaN(lastUpdate) && diff < 600) return '#eab308'; // Away: yellow (5-10 min)
  return '#000000'; // Offline: black (>10 min)
};

// Helper: status text
const getStatusText = (student) => {
  const lastUpdate = new Date(student.lastRoomUpdate || student.timestamp || 0);
  const now = new Date();
  const diff = (now - lastUpdate) / 1000; // seconds
  if (!isNaN(lastUpdate) && diff < 300) return 'Online';
  if (!isNaN(lastUpdate) && diff < 600) return 'Away';
  return 'Offline';
};

// Room center positions (SVG coordinates, extracted from groundfloor.svg)


const DOT_LEGEND = [
  { color: '#166534', label: 'Online' },
  { color: '#eab308', label: 'Away' },
  { color: '#000000', label: 'Offline' },
];

// Room color mapping (semi-transparent backgrounds, visually distinct)


// SVG path/rect for each room (from groundfloor.svg)
const ROOM_SHAPES = {
  room01: <Path d="M156 4.5L94 113.5H221V112.5V4.5H156Z" />, // polygon
  room02: <Path d="M386 4.5H221V6V113.5H386V4.5Z" />, // polygon
  room03: <Path d="M491 4.5H386V103.5H404.5V156.5H417V214.5H389V223H417V275.5H458.5V223H487.5V214.5H458.5V156.5H472V103.5H491V4.5Z" />,
  room04: <Path d="M680 4.5H491V103.5H472V113.5L680 113V4.5Z" />,
  room05: <Path d="M55.5 181L86.5 126.5H157V180.5L55.5 181Z" />,
  room06: <Path d="M221 126.5H157V180.5H221V126.5Z" />,
  room07: <Path d="M9.99998 262.781L43.1227 202.502L43.6246 202H221V310H29.0706C5.47376 294.241 2.92652 283.632 9.99998 262.781Z" />,
  room08: <Path d="M324 244.5H221V310H303V286.5H324V244.5Z" />,
  room09: <Rect x={239.5} y={127.5} width={41} height={99} rx={7} />,
  room10: <Rect x={239.5} y={226.5} width={41} height={18} rx={7} />,
  room11: <Rect x={280.5} y={127.5} width={25} height={117} rx={7} />,
  room12: <Path d="M319.5 209.5V157H389V209.5H319.5Z" />,
  room13: <Path d="M497 157H486.5M486.5 157V210H555.5V157H486.5Z" />,
  room14: <Path d="M324 223V244.5V272.5H345V281.5H473.5V273H458.5V275.5H417V223H389H324Z" />,
  room15: <Path d="M458.5 223H487.5H544V273H531V281.5H473.5V273H458.5V223Z" />,
  room16: <Path d="M599.5 259.5V127.5H640V259.5H599.5Z" />,
  room17: <Path d="M680.5 127.5H640V259.5H680.5V127.5Z" />,
  room18: <Path d="M638.5 259.5H580.5V273H552V273.5V286H573.5V310H638.5V259.5Z" />,
  room19: <Path d="M778 310H638.5V259.5H778V310Z" />,
  room20: <Path d="M324 272.5V286.5H303V310H388V281.5H345V272.5H324Z" />,
  room21: <Path d="M488.5 281.5H388V310H488.5V281.5Z" />,
  room22: <Path d="M531 281.5H488.5V310H573.5V286H552V273H531V281.5Z" />,
  room23: <Rect x={319.5} y={127.5} width={32} height={29.5} rx={7} />,
  room24: <Rect x={351.5} y={127.5} width={29.5} height={29.5} rx={7} />,
  room25: <Rect x={497} y={127.5} width={28.5} height={29.5} rx={7} />,
  room26: <Rect x={525.5} y={127.5} width={55} height={29.5} rx={7} />,
  room27: <Rect x={555.5} y={157} width={25} height={53} rx={7} />,
  room28: <Path d="M778 259.5H680.5L680 4H778V259.5Z" />,
  room29: <Path d="M544 273V223H580.5V273H544Z" />,
};

const IndoorMap = ({ studentsByRoom, students, beacons }) => {
  const svgWidth = 784;
  const svgHeight = 316;
  const [indoorZoomModalVisible, setIndoorZoomModalVisible] = useState(false);
  const [mapScale, setMapScale] = useState(1);
  const scrollViewRef = useRef(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [studentModalVisible, setStudentModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPathForStudent, setShowPathForStudent] = useState(null);
  const [selectedStatuses, setSelectedStatuses] = useState(['Online', 'Away', 'Offline']);
  const [searchFocused, setSearchFocused] = useState(false);

  // Helper to get status for filtering
  const getStudentStatus = (student) => {
    const lastUpdate = new Date(student.lastRoomUpdate || student.timestamp || 0);
    const now = new Date();
    const diff = (now - lastUpdate) / 1000; // seconds
    if (!isNaN(lastUpdate) && diff < 300) return 'Online';
    if (!isNaN(lastUpdate) && diff < 600) return 'Away';
    return 'Offline';
  };

  // Remade filtering logic
  const filteredStudents = useMemo(() => {
    if (selectedStudent) {
      console.log('DEBUG: filteredStudents - selectedStudent set:', selectedStudent);
      return [selectedStudent];
    }
    const q = searchQuery.trim().toLowerCase();
    if (!q) return students.filter(s => selectedStatuses.includes(getStudentStatus(s)));
    const result = students.filter(s => {
      const name = (s.fullName || '').toLowerCase();
      const matchesSearch = name.includes(q);;
      const matchesStatus = selectedStatuses.includes(getStudentStatus(s));
      return matchesSearch && matchesStatus;
    });
    console.log('DEBUG: filteredStudents - result:', result);
    return result;
  }, [searchQuery, students, selectedStatuses, selectedStudent]);

  // Compute filtered students by room
  const filteredStudentsByRoom = useMemo(() => {
    if (selectedStudent) {
      const map = {};
      const s = selectedStudent;
      const roomId = (s.nearestBeacon?.roomId || s.currentRoomId || '').toLowerCase();
      if (roomId) map[roomId] = [s];
      return map;
    }
    const map = {};
    filteredStudents.forEach(s => {
      const roomId = (s.nearestBeacon?.roomId || s.currentRoomId || '').toLowerCase();
      if (!roomId) return;
      if (!map[roomId]) map[roomId] = [];
      map[roomId].push(s);
    });
    return map;
  }, [filteredStudents, selectedStudent]);

  // Helper: match exact student by name
  const findStudentByName = (name) => {
    if (!name) return null;
    const lower = name.trim().toLowerCase();
    return students.find(s => s.fullName && s.fullName.trim().toLowerCase() === lower) || null;
  };

  const handleStudentPress = (student) => {
    setSelectedStudent(student);
    setSelectedCluster(null);
    setStudentModalVisible(true);
  };
  const handleClusterPress = (cluster) => {
    setSelectedStudent(null);
    setSelectedCluster(cluster);
    setStudentModalVisible(true);
  };
  const handleReset = () => {
    setMapScale(1);
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ x: 0, y: 0, animated: true });
    }
  };

  const getRoomDotPosition = (student) => {
    // Prefer student's svgPosition, else use mapping
    if (student.nearestBeacon?.svgPosition) return student.nearestBeacon.svgPosition;
    if (student.svgPosition) return student.svgPosition;
    const roomId = (student.nearestBeacon?.roomId || student.currentRoomId || '').toLowerCase();
    return ROOM_DOT_POSITIONS[roomId] || { x: 50, y: 50 };
  };

  // SVG Map rendering (rooms, border, and student markers)
  const renderSVGMap = (scale = 1) => (
    <Svg width={svgWidth * scale} height={svgHeight * scale} viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
      {/* Render each room as base SVG, no fill or stroke */}
      {Object.entries(ROOM_SHAPES).map(([roomId, shape]) => {
        return React.cloneElement(shape, {
          key: roomId,
          fill: 'none',
          stroke: 'none',
        });
      })}
      {/* --- Render the full SVG map background --- */}
      <G id="groundfloor">
        <G id="room08">
          <Path d="M324 244.5H221V310H303V286.5H324V244.5Z" stroke="black" fill="#fff" />
        </G>
        <G id="room14">
          <Path d="M324 223V244.5V272.5H345V281.5H473.5V273H458.5V275.5H417V223H389H324Z" stroke="black" fill="#fff" />
        </G>
        <G id="room20">
          <Path d="M324 272.5V286.5H303V310H388V281.5H345V272.5H324Z" stroke="black" fill="#fff" />
        </G>
        <G id="room21">
          <Path d="M488.5 281.5H388V310H488.5V281.5Z" stroke="black" fill="#fff" />
        </G>
        <G id="room22">
          <Path d="M531 281.5H488.5V310H573.5V286H552V273H531V281.5Z" stroke="black" fill="#fff" />
        </G>
        <G id="room29">
          <Path d="M544 273V223H580.5V273H544Z" stroke="black" fill="#fff" />
        </G>
        <G id="room15">
          <Path d="M458.5 223H487.5H544V273H531V281.5H473.5V273H458.5V223Z" stroke="black" fill="#fff" />
        </G>
        <G id="room18">
          <Path d="M638.5 259.5H580.5V273H552V273.5V286H573.5V310H638.5V259.5Z" stroke="black" fill="#fff" />
        </G>
        <G id="room19">
          <Path d="M778 310H638.5V259.5H778V310Z" stroke="black" fill="#fff" />
        </G>
        <G id="room28">
          <Path d="M778 259.5H680.5L680 4H778V259.5Z" stroke="black" fill="#fff" />
        </G>
        <G id="room26">
          <Path d="M580.5 127.5H525.5V157H580.5V127.5Z" stroke="black" fill="#fff" />
        </G>
        <G id="room13">
          <Path d="M497 157H486.5M486.5 157V210H555.5V157H486.5Z" stroke="black" fill="#fff" />
        </G>
        <G id="room27">
          <Path d="M555.5 157H580.5V210H555.5V157Z" stroke="black" fill="#fff" />
        </G>
        <G id="room25">
          <Path d="M525.5 127.5H497V157H525.5V127.5Z" stroke="black" fill="#fff" />
        </G>
        <G id="room10">
          <Path d="M280.5 226.5H239.5V244.5H280.5V226.5Z" stroke="black" fill="#fff" />
        </G>
        <G id="room16">
          <Path d="M599.5 259.5V127.5H640V259.5H599.5Z" stroke="black" fill="#fff" />
        </G>
        <G id="room17">
          <Path d="M680.5 127.5H640V259.5H680.5V127.5Z" stroke="black" fill="#fff" />
        </G>
        <G id="room11">
          <Rect x="239.5" y="127.5" width="41" height="99" stroke="black" fill="#cbc858" />
        </G>
        <G id="room23">
          <Path d="M351.5 157H319.5V127.5H351.5V157Z" stroke="black" fill="#fff" />
        </G>
        <G id="room24">
          <Path d="M381 127.5V157H351.5V127.5H381Z" stroke="black" fill="#fff" />
        </G>
        <G id="room12">
          <Path d="M319.5 209.5V157H389V209.5H319.5Z" stroke="black" fill="#fff" />
        </G>
        <G id="room07">
          <Path d="M9.99998 262.781L43.1227 202.502L43.6246 202H221V310H29.0706C5.47376 294.241 2.92652 283.632 9.99998 262.781Z" stroke="black" fill="#fff" />
        </G>
        <G id="room09">
          <Rect x="239.5" y="127.5" width="41" height="99" stroke="black" fill="#fff" />
        </G>
        <G id="room06">
          <Path d="M221 126.5H157V180.5H221V126.5Z" stroke="black" fill="#fff" />
        </G>
        <G id="room05">
          <Path d="M55.5 181L86.5 126.5H157V180.5L55.5 181Z" stroke="black" fill="#fff" />
        </G>
        <G id="room04">
          <Path d="M680 4.5H491V103.5H472V113.5L680 113V4.5Z" stroke="black" fill="#fff" />
        </G>
        <G id="room03">
          <Path d="M491 4.5H386V103.5H404.5V156.5H417V214.5H389V223H417V275.5H458.5V223H487.5V214.5H458.5V156.5H472V103.5H491V4.5Z" stroke="black" fill="#fff" />
        </G>
        <G id="room02">
          <Path d="M386 4.5H221V6V113.5H386V4.5Z" stroke="black" fill="#fff" />
        </G>
        <G id="room01">
          <Path d="M156 4.5L94 113.5H221V112.5V4.5H156Z" stroke="black" fill="#fff" />
        </G>
        <G id="main-outside-border">
          <Path d="M2.99996 263L151 0.5L783.5 1V315.5L27 314.5C1.50603 298.569 -3.04906 287.111 2.99996 263Z" stroke="black" fill="none" />
        </G>
      </G>
      {/* --- Polyline with arrowheads and dots for selected student's last 3 rooms --- */}
      {(showPathForStudent && Array.isArray(showPathForStudent.roomHistory) && showPathForStudent.roomHistory.length >= 2) && (() => {
        const rawPath = showPathForStudent.roomHistory;
        // Ensure path is in chronological order (oldest first, newest last)
        const path = Array.isArray(rawPath) && rawPath.length > 1 && rawPath[0].timestamp > rawPath[rawPath.length-1].timestamp
          ? [...rawPath].reverse() : rawPath;
        // Filter out null/invalid rooms
        const filteredPath = path.filter(room => room && room.roomId && ROOM_DOT_POSITIONS[room.roomId]);
        if (filteredPath.length < 2) return null;
        // Polyline points (always use ROOM_DOT_POSITIONS)
        const points = filteredPath.map(room => {
          const pos = ROOM_DOT_POSITIONS[room.roomId];
          return `${pos.x},${pos.y}`;
        }).join(' ');
        // Helper to draw arrowhead
        const renderArrow = (fromRoom, toRoom, idx) => {
          const from = ROOM_DOT_POSITIONS[fromRoom.roomId];
          const to = ROOM_DOT_POSITIONS[toRoom.roomId];
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const len = Math.sqrt(dx*dx + dy*dy);
          if (len === 0) return null;
          // Arrow size
          const size = 12;
          // Unit vector
          const ux = dx / len;
          const uy = dy / len;
          // Arrow tip (offset further from avatar)
          const tipX = to.x - ux * 22; // offset further from the dot/avatar
          const tipY = to.y - uy * 22;
          // Base corners
          const leftX = tipX - uy * size/2 - ux * size;
          const leftY = tipY + ux * size/2 - uy * size;
          const rightX = tipX + uy * size/2 - ux * size;
          const rightY = tipY - ux * size/2 - uy * size;
          return (
            <Polygon
              key={`arrow-${idx}`}
              points={`${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`}
              fill="#2563EB"
              opacity={0.85}
            />
          );
        };
        // Helper to get initials
        const getInitials = (student) => {
          if (!student.fullName) return '?_';
          const parts = student.fullName.trim().split(' ');
          let initials = '';
          if (parts.length === 1) {
            const firstTwo = parts[0].slice(0, 2).toUpperCase();
            if (firstTwo.length === 2) {
              initials = firstTwo;
            } else if (firstTwo.length === 1) {
              initials = firstTwo[0] + '_';
            } else {
              initials = '?_';
            }
          } else {
            initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
          }
          return initials;
        };
        // Helper to get status color
        const statusColor = getStatusColor(showPathForStudent);
        // Current room (last in path)
        const currentRoom = filteredPath[filteredPath.length - 1];
        const startRoom = filteredPath[0];
        const currentPos = ROOM_DOT_POSITIONS[currentRoom.roomId];
        const startPos = ROOM_DOT_POSITIONS[startRoom.roomId];
        return (
          <>
            {/* Polyline (thinner, more transparent) */}
            <Polyline
              points={points}
              fill="none"
              stroke="#2563EB"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.45}
            />
            {/* Dots at each room */}
            {filteredPath.map((room, idx) => {
              const pos = ROOM_DOT_POSITIONS[room.roomId];
              return (
                <Circle
                  key={`dot-${idx}`}
                  cx={pos.x}
                  cy={pos.y}
                  r={7}
                  fill="#2563EB"
                  opacity={0.85}
                  stroke="#fff"
                  strokeWidth={2}
                />
              );
            })}
            {/* Arrowheads for each segment */}
            {filteredPath.slice(0, -1).map((room, idx) => renderArrow(room, filteredPath[idx+1], idx))}
            {/* Move the Avatar at current room (last in path) and label to the end so it is drawn on top */}
            <Circle
              cx={currentPos.x}
              cy={currentPos.y}
              r={20}
              fill={statusColor}
              opacity={1}
              stroke="#fff"
              strokeWidth={2}
              style={{
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.18,
                shadowRadius: 4,
                elevation: 3,
              }}
            />
            <SvgText
              x={currentPos.x}
              y={currentPos.y + 6}
              fontSize={13}
              fill="#fff"
              fontWeight="bold"
              textAnchor="middle"
              opacity={1}
              letterSpacing={2}
            >
              {getInitials(showPathForStudent)}
            </SvgText>
            {/* 'Current' label */}
            <SvgText
              x={currentPos.x}
              y={currentPos.y - 26}
              fontSize={13}
              fill="#2563EB"
              fontWeight="bold"
              textAnchor="middle"
              opacity={1}
              letterSpacing={1}
            >
              Current
            </SvgText>
            {/* 'Start' label at oldest room */}
            <SvgText
              x={startPos.x}
              y={startPos.y - 18}
              fontSize={11}
              fill="#2563EB"
              fontWeight="bold"
              textAnchor="middle"
              opacity={0.85}
              style={{ fontFamily: 'System' }}
            >
              Start
            </SvgText>
          </>
        );
      })()}
      {/* --- Overlay student markers using filtered students --- */}
      {Object.entries(filteredStudentsByRoom).map(([roomId, roomStudentsRaw]) => {
        const roomStudents = roomStudentsRaw || [];
        if (!roomStudents.length) return null;
        // Use mapping for base position
        const basePos = ROOM_DOT_POSITIONS[roomId] || { x: 50, y: 50 };
        if (roomStudents.length > 3) {
          // Cluster at center
          return (
            <G key={roomId}>
              <Circle
                cx={basePos.x}
                cy={basePos.y}
                r={10}
                fill={'#6366F1'}
                stroke="#fff"
                strokeWidth={2}
                onPress={() => handleClusterPress(roomStudents)}
              />
              <SvgText
                x={basePos.x}
                y={basePos.y + 5}
                fontSize={13}
                fill="#fff"
                fontWeight="bold"
                textAnchor="middle"
              >
                {roomStudents.length}
              </SvgText>
            </G>
          );
        }
        // Spread up to 3 dots horizontally around center
        // Deduplicate students by id/uid before rendering
        const uniqueRoomStudents = Array.from(
          new Map(roomStudents.map(s => [(s.id || s.uid || Math.random()), s])).values()
        );
        return uniqueRoomStudents.map((student, idx) => {
          const offset = (uniqueRoomStudents.length === 1) ? 0 : (idx - (uniqueRoomStudents.length - 1) / 2) * 18;
          const pos = getRoomDotPosition(student) || basePos;
          return (
            <G key={student.id || student.uid || idx}>
              <Circle
                cx={basePos.x + offset}
                cy={basePos.y}
                r={7.5}
                fill={getStatusColor(student)}
                stroke="#fff"
                strokeWidth={2}
                onPress={() => handleStudentPress(student)}
              />
              <SvgText
                x={basePos.x + offset}
                y={basePos.y + 4}
                fontSize={10}
                fill="#fff"
                fontWeight="bold"
                textAnchor="middle"
              >
                {(student.fullName || student.name || student.displayName || '?')[0]}
              </SvgText>
            </G>
          );
        });
      })}
    </Svg>
  );

  // For tracked count:
  const trackedCount = students.filter(s => s.nearestBeacon || (s.currentRoomId && s.svgPosition)).length;

  // --- Clear Path Button (shared for both views) ---
  const renderClearPathButton = () => (
    showPathForStudent && (
      <TouchableOpacity
        onPress={() => setShowPathForStudent(null)}
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 20,
          backgroundColor: '#f3f4f6',
          borderRadius: 12,
          paddingVertical: 6,
          paddingHorizontal: 14,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.10,
          shadowRadius: 6,
          elevation: 3,
          flexDirection: 'row',
          alignItems: 'center',
        }}
        accessibilityLabel="Clear Path"
      >
        <Feather name="x-circle" size={18} color="#334155" style={{ marginRight: 6 }} />
        <Text style={{ fontWeight: '600', fontSize: 15, color: '#334155', fontFamily: 'System' }}>Clear Path</Text>
      </TouchableOpacity>
    )
  );

  // --- UI: Search Suggestions Dropdown ---
  // Only show if searchFocused, searchQuery, filteredStudents, and NOT selectedStudent
  const showSuggestions = searchFocused && searchQuery && filteredStudents.length > 0 && !selectedStudent;

  const renderStatusBadge = (status) => {
    let color = '#000000';
    if (status === 'Online') color = '#166534';
    else if (status === 'Away') color = '#eab308';
    return (
      <View style={{ backgroundColor: color, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8, alignSelf: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>{status.toLowerCase()}</Text>
      </View>
    );
  };

  const renderSuggestionDropdown = (isModal = false) => {
    if (!showSuggestions) return null;
    // Use a higher top offset in modal to account for modal header
    const top = isModal ? 84 : 68;
    const left = isModal ? 32 : 16;
    const right = isModal ? 32 : 16;
    return (
      <View
        style={{ position: 'absolute', top, left, right, backgroundColor: '#fff', borderRadius: 10, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 30, zIndex: 9999, padding: 8 }}
        pointerEvents="auto"
      >
        {filteredStudents.slice(0, 6).map(student => (
          <TouchableOpacity
            key={student.id || student.uid}
            onPress={() => {
              console.log('DEBUG: Suggestion card clicked for', student.fullName);
              setSelectedStudent(student);
              setSearchQuery(student.fullName);
              setSearchFocused(false);
            }}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', borderRadius: 10, padding: 10, marginBottom: 4, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 }}
            activeOpacity={0.7}
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: getStatusColor(student), justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>{(() => {
                if (!student.fullName) return '?_';
                const parts = student.fullName.trim().split(' ');
                if (parts.length === 1) {
                  const firstTwo = parts[0].slice(0, 2).toUpperCase();
                  if (firstTwo.length === 2) return firstTwo;
                  if (firstTwo.length === 1) return firstTwo[0] + '_';
                  return '?_';
                }
                return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
              })()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', fontSize: 15, color: '#22223b' }}>{student.fullName}</Text>
              <Text style={{ color: '#64748b', fontSize: 13 }}>{student.nearestBeacon?.roomName || student.currentRoomName || student.currentRoomId || '-'}</Text>
            </View>
            {renderStatusBadge(getStudentStatus(student))}
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  // --- UI: Search and Filter Bar (split into two rows) ---
  const statusOptions = [
    { label: 'Online', color: '#166534' },
    { label: 'Away', color: '#eab308' },
    { label: 'Offline', color: '#000000' },
  ];

  const renderSearchBar = () => (
    <View style={{ width: '100%', backgroundColor: '#f3f4f6', borderRadius: 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, marginBottom: 8, position: 'relative' }}>
      <Feather name="search" size={18} color="#64748b" style={{ marginRight: 6 }} />
      <TextInput
        style={{ flex: 1, fontSize: 15, paddingVertical: 8, color: '#22223b', backgroundColor: 'transparent' }}
        placeholder="Search students or rooms..."
        placeholderTextColor="#a0aec0"
        value={searchQuery}
        onChangeText={text => {
          console.log('DEBUG: onChangeText', text);
          setSearchQuery(text);
          if (selectedStudent) {
            setSelectedStudent(null);
            console.log('DEBUG: Cleared selectedStudent due to typing');
          }
        }}
        onFocus={() => {
          setSearchFocused(true);
          console.log('DEBUG: Search focused');
        }}
        onBlur={() => {
          setTimeout(() => setSearchFocused(false), 150);
          if (selectedStudent) return;
          const match = findStudentByName(searchQuery);
          if (match) setSelectedStudent(match);
          else setSelectedStudent(null);
        }}
        onSubmitEditing={() => {
          if (selectedStudent) return;
          const match = findStudentByName(searchQuery);
          if (match) setSelectedStudent(match);
          else setSelectedStudent(null);
        }}
      />
      {(!!searchQuery || selectedStudent) && (
        <TouchableOpacity onPress={() => {
          setSearchQuery('');
          setSelectedStudent(null);
          setSearchFocused(false);
          console.log('DEBUG: Cleared search and selectedStudent via X button');
        }} style={{ marginLeft: 6 }}>
          <Feather name="x-circle" size={20} color="#64748b" />
        </TouchableOpacity>
      )}
    </View>
  );

  const renderFilterAndZoomRow = (isModal = false) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, width: '100%' }}>
      <View style={{ flexDirection: 'row', gap: 4, flex: 1 }}>
        {statusOptions.map(opt => (
          <TouchableOpacity
            key={opt.label}
            onPress={() => {
              setSelectedStatuses(prev =>
                prev.includes(opt.label)
                  ? prev.filter(s => s !== opt.label)
                  : [...prev, opt.label]
              );
            }}
            style={{
              backgroundColor: selectedStatuses.includes(opt.label) ? opt.color : '#f3f4f6',
              borderRadius: 16,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderWidth: 1,
              borderColor: selectedStatuses.includes(opt.label) ? opt.color : '#e5e7eb',
              marginLeft: 2,
            }}
          >
            <Text style={{ color: selectedStatuses.includes(opt.label) ? '#fff' : '#22223b', fontWeight: '600', fontSize: 13 }}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {/* Zoom button */}
      <TouchableOpacity
        style={{ marginLeft: 8, backgroundColor: '#fff', borderRadius: 20, width: 40, height: 40, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3, zIndex: 10 }}
        onPress={() => isModal ? null : setIndoorZoomModalVisible(true)}
        disabled={isModal}
        accessibilityLabel="Zoom into indoor map"
      >
        <Feather name="zoom-in" size={24} color="#2563EB" />
      </TouchableOpacity>
    </View>
  );

  // --- Main Card ---
  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, position: 'relative' }} pointerEvents="box-none">
      {renderClearPathButton()}
      {renderSearchBar()}
      {renderFilterAndZoomRow(false)}
      <ScrollView horizontal contentContainerStyle={{ alignItems: 'center' }}>
        {renderSVGMap(1)}
      </ScrollView>
      {/* Suggestion dropdown rendered last so it is always on top and receives all touches */}
      {renderSuggestionDropdown(false)}
      {/* Zoom Modal */}
      <Modal
        visible={indoorZoomModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIndoorZoomModalVisible(false)}
      >
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(30,41,59,0.5)' }} pointerEvents="box-none">
          <View style={{ width: '90%', height: '80%', borderRadius: 12, overflow: 'hidden', backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.10, shadowRadius: 16, elevation: 8, padding: 0, position: 'relative' }}>
            {/* Top bar with search, filter, and zoom (disabled in modal) */}
            <View style={{ padding: 16, backgroundColor: '#fff', borderTopLeftRadius: 12, borderTopRightRadius: 12, position: 'relative' }}>
              {renderSearchBar()}
              {renderFilterAndZoomRow(true)}
              {/* Close (X) button in top right */}
              <TouchableOpacity
                onPress={() => setIndoorZoomModalVisible(false)}
                style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#f3f4f6', borderRadius: 9999, padding: 6, zIndex: 200 }}
                accessibilityLabel="Close zoom modal"
              >
                <Feather name="x" size={24} color="#334155" />
              </TouchableOpacity>
            </View>
            {/* Suggestion dropdown rendered last so it is always on top and receives all touches */}
            {renderSuggestionDropdown(true)}
            {renderClearPathButton()}
            {/* Improved Pan/Zoom: Single ScrollView horizontal+vertical, no nesting */}
            <ScrollView
              ref={scrollViewRef}
              horizontal
              contentContainerStyle={{ width: svgWidth * mapScale, height: svgHeight * mapScale }}
              style={{ flex: 1 }}
              maximumZoomScale={3}
              minimumZoomScale={0.5}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              {renderSVGMap(mapScale)}
            </ScrollView>
          </View>
        </View>
      </Modal>
      {/* Student/Cluster Details Modal */}
      <Modal
        visible={studentModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setStudentModalVisible(false)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: 'rgba(30,41,59,0.18)' }}>
          <View style={{ width: '98%', borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: '#fff', padding: 24, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontWeight: 'bold', fontSize: 22 }}>Student Details</Text>
              <TouchableOpacity onPress={() => setStudentModalVisible(false)}>
                <Feather name="x" size={28} color="#334155" />
              </TouchableOpacity>
            </View>
            {/* Search Bar */}
            <View style={{ marginBottom: 16 }}>
              <TextInput
                placeholder="Search student by name or email..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={{ backgroundColor: '#f3f4f6', borderRadius: 8, padding: 10, fontSize: 16 }}
              />
            </View>
            {/* Search Results */}
            {searchQuery ? (
              <FlatList
                data={filteredStudents}
                keyExtractor={item => item.id || item.uid}
                renderItem={({ item }) => (
                  <TouchableOpacity onPress={() => { setSelectedStudent(item); setSelectedCluster(null); }} style={{ paddingVertical: 10 }}>
                    <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{item.fullName}</Text>
                    <Text style={{ color: '#64748b', fontSize: 13 }}>{item.email}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={{ color: '#64748b', fontSize: 15 }}>No students found.</Text>}
                style={{ maxHeight: 200, marginBottom: 12 }}
              />
            ) : null}
            {/* Student/Cluster Details */}
            {selectedStudent && !searchQuery && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}>
                <View style={{ minWidth: 120 }}>
                  <Text style={{ color: '#64748b', fontSize: 15 }}>Name</Text>
                  <Text style={{ fontWeight: 'bold', fontSize: 18 }}>{selectedStudent.fullName}</Text>
                  <Text style={{ color: '#64748b', fontSize: 15, marginTop: 8 }}>Email</Text>
                  <Text style={{ fontWeight: 'bold', fontSize: 18 }}>{selectedStudent.email}</Text>
                </View>
                <View style={{ minWidth: 120 }}>
                  <Text style={{ color: '#64748b', fontSize: 15 }}>Current Room</Text>
                  <Text style={{ fontWeight: 'bold', fontSize: 18 }}>{selectedStudent.nearestBeacon?.roomName || selectedStudent.currentRoomName || selectedStudent.currentRoomId || '-'}</Text>
                  <Text style={{ color: '#64748b', fontSize: 15, marginTop: 8 }}>Status</Text>
                  <Text style={{ fontWeight: 'bold', fontSize: 18 }}>{getStatusText(selectedStudent)}</Text>
                </View>
                <View style={{ minWidth: 120 }}>
                  <Text style={{ color: '#64748b', fontSize: 15 }}>Last Seen</Text>
                  <Text style={{ fontWeight: 'bold', fontSize: 18 }}>{selectedStudent.lastSeen || selectedStudent.timestamp || '-'}</Text>
                </View>
                {/* Show Path Button */}
                <TouchableOpacity
                  onPress={() => {
                    setShowPathForStudent(selectedStudent);
                    setStudentModalVisible(false);
                  }}
                  style={{
                    marginTop: 18,
                    backgroundColor: '#2563EB',
                    borderRadius: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 18,
                    alignSelf: 'flex-start',
                    shadowColor: '#2563EB',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.10,
                    shadowRadius: 6,
                    elevation: 2,
                  }}
                  accessibilityLabel="Show Path"
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16, fontFamily: 'System' }}>Show Path</Text>
                </TouchableOpacity>
              </View>
            )}
            {selectedCluster && !searchQuery && (
              <View>
                {selectedCluster.map((student, idx) => (
                  <View key={student.id || idx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: getStatusColor(student), justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                      <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>{student.fullName ? student.fullName[0] : 'S'}</Text>
                    </View>
                    <View>
                      <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{student.fullName}</Text>
                      <Text style={{ color: '#64748b', fontSize: 13 }}>{student.email}</Text>
                      <Text style={{ color: '#64748b', fontSize: 13 }}>Room: {student.nearestBeacon?.roomName || student.currentRoomName || student.currentRoomId || '-'}</Text>
                      <Text style={{ color: '#64748b', fontSize: 13 }}>Status: {getStatusText(student)}</Text>
                      <Text style={{ color: '#64748b', fontSize: 13 }}>Last Seen: {student.lastSeen || student.timestamp || '-'}</Text>
                      {/* Show Path Button for cluster student */}
                      <TouchableOpacity
                        onPress={() => {
                          setShowPathForStudent(student);
                          setStudentModalVisible(false);
                        }}
                        style={{
                          marginTop: 8,
                          backgroundColor: '#2563EB',
                          borderRadius: 8,
                          paddingVertical: 6,
                          paddingHorizontal: 14,
                          alignSelf: 'flex-start',
                          shadowColor: '#2563EB',
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.10,
                          shadowRadius: 6,
                          elevation: 2,
                        }}
                        accessibilityLabel="Show Path"
                      >
                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14, fontFamily: 'System' }}>Show Path</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 16 }}>
              {DOT_LEGEND.map(item => (
                <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12 }}>
                  <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: item.color, marginRight: 6, borderWidth: 1, borderColor: '#e5e7eb' }} />
                  <Text style={{ fontSize: 13, color: '#64748b' }}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default IndoorMap; 