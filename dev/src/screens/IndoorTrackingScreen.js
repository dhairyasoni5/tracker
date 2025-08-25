import React, { useState } from 'react';
import { View, StyleSheet, Dimensions, ScrollView } from 'react-native';
import BLEPermission from '../components/BLEPermission';
import UserAvatar from '../components/UserAvatar';
import { BEACON_DATA } from '../data/beacons';
import { useIndoorTracking } from '../hooks/useIndoorTracking';
import { Svg, Path, Text, Circle, G, Rect } from 'react-native-svg';

// Helper to extract room paths from SVG (simulate static import for now)
const ROOM_PATHS = {
  room08: 'M324 244.5H221V310H303V286.5H324V244.5Z',
  room14: 'M324 223V244.5V272.5H345V281.5H473.5V273H458.5V275.5H417V223H389H324Z',
  room20: 'M324 272.5V286.5H303V310H388V281.5H345V272.5H324Z',
  room21: 'M488.5 281.5H388V310H488.5V281.5Z',
  room22: 'M531 281.5H488.5V310H573.5V286H552V273H531V281.5Z',
  room29: 'M544 273V223H580.5V273H544Z',
  room15: 'M458.5 223H487.5H544V273H531V281.5H473.5V273H458.5V223Z',
  room18: 'M638.5 259.5H580.5V273H552V273.5V286H573.5V310H638.5V259.5Z',
  room19: 'M778 310H638.5V259.5H778V310Z',
  room28: 'M778 259.5H680.5L680 4H778V259.5Z',
  room26: 'M580.5 127.5H525.5V157H580.5V127.5Z',
  room13: 'M497 157H486.5M486.5 157V210H555.5V157H486.5Z',
  room27: 'M555.5 157H580.5V210H555.5V157Z',
  room25: 'M525.5 127.5H497V157H525.5V127.5Z',
  room10: 'M280.5 226.5H239.5V244.5H280.5V226.5Z',
  room16: 'M599.5 259.5V127.5H640V259.5H599.5Z',
  room17: 'M680.5 127.5H640V259.5H680.5V127.5Z',
  room11: 'M305.5 127.5H280.5V244.5H305.5V127.5Z',
  room23: 'M351.5 157H319.5V127.5H351.5V157Z',
  room24: 'M381 127.5V157H351.5V127.5H381Z',
  room12: 'M319.5 209.5V157H389V209.5H319.5Z',
  room07: 'M9.99998 262.781L43.1227 202.502L43.6246 202H221V310H29.0706C5.47376 294.241 2.92652 283.632 9.99998 262.781Z',
  room09: '', // Rectangle, handled below
  room06: 'M221 126.5H157V180.5H221V126.5Z',
  room05: 'M55.5 181L86.5 126.5H157V180.5L55.5 181Z',
  room04: 'M680 4.5H491V103.5H472V113.5L680 113V4.5Z',
  room03: 'M491 4.5H386V103.5H404.5V156.5H417V214.5H389V223H417V275.5H458.5V223H487.5V214.5H458.5V156.5H472V103.5H491V4.5Z',
  room02: 'M386 4.5H221V6V113.5H386V4.5Z',
  room01: 'M156 4.5L94 113.5H221V112.5V4.5H156Z',
};

const ROOM_RECT = {
  room09: { x: 239.5, y: 127.5, width: 41, height: 99 },
};

function getRandomColor(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = (hash % 360 + 360) % 360;
  return `hsl(${h}, 60%, 85%)`;
}

const IndoorTrackingScreen = () => {
  const { users, loading, error } = useIndoorTracking();
  const [bleGranted, setBleGranted] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [mapDimensions, setMapDimensions] = useState({
    width: Dimensions.get('window').width - 40,
    height: 400
  });

  React.useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setMapDimensions({
        width: window.width - 40,
        height: 400
      });
    });
    return () => subscription?.remove();
  }, []);

  const roomColors = React.useMemo(() => {
    const colors = {};
    Object.keys(ROOM_PATHS).forEach(roomId => {
      colors[roomId] = getRandomColor(roomId);
    });
    Object.keys(ROOM_RECT).forEach(roomId => {
      colors[roomId] = getRandomColor(roomId);
    });
    return colors;
  }, []);

  // Get room info from beacon data
  // const getRoomInfo = (roomId) => {
  //   return BEACON_DATA.find(beacon => beacon.svgRoomId === roomId);
  // };

  // Get users in specific room
  const getUsersInRoom = (roomId) => {
    return users.filter(user => {
      const beacon = BEACON_DATA.find(b => b.svgRoomId === roomId);
      return beacon && user.currentRoom === beacon.roomId;
    });
  };

  if (!bleGranted) {
    return <BLEPermission onPermissionGranted={() => setBleGranted(true)} onPermissionDenied={() => {}} />;
  }

  if (loading) {
    return <View style={styles.centered}><Text>Loading...</Text></View>;
  }

  return (
    <View style={styles.container}>
      <ScrollView 
        horizontal={true}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        <Svg
          width={mapDimensions.width}
          height={mapDimensions.height}
          viewBox="0 0 784 316"
          style={styles.svg}
        >
          {/* Render all room paths from SVG */}
          {Object.entries(ROOM_PATHS).map(([roomId, d]) => {
            const roomUsers = getUsersInRoom(roomId);
            const beacon = getRoomInfo(roomId);
            const roomColor = roomColors[roomId];
            return d ? (
              <G key={roomId}>
                <Path
                  d={d}
                  fill={roomColor}
                  stroke={roomColor}
                  strokeWidth="2"
                />
                {/* Room label */}
                {beacon && (
                  <Text
                    x={beacon.svgPosition.x}
                    y={beacon.svgPosition.y - 10}
                    textAnchor="middle"
                    fontSize="12"
                    fill="#374151"
                    fontWeight="600"
                  >
                    {beacon.roomName}
          </Text>
                )}
                {/* User count */}
                {beacon && roomUsers.length > 0 && (
                  <G>
                    <Circle
                      cx={beacon.svgPosition.x + 24}
                      cy={beacon.svgPosition.y - 18}
                      r="10"
                      fill="#10B981"
                    />
                    <Text
                      x={beacon.svgPosition.x + 24}
                      y={beacon.svgPosition.y - 14}
                      textAnchor="middle"
                      fontSize="10"
                      fill="white"
                      fontWeight="bold"
                    >
                      {roomUsers.length}
                </Text>
                  </G>
                )}
              </G>
            ) : null;
          })}
          {/* Render rectangles for rooms with rects */}
          {Object.entries(ROOM_RECT).map(([roomId, rect]) => {
            const roomUsers = getUsersInRoom(roomId);
            const beacon = getRoomInfo(roomId);
            const roomColor = roomColors[roomId];
            return (
              <G key={roomId}>
                <Rect
                  x={rect.x}
                  y={rect.y}
                  width={rect.width}
                  height={rect.height}
                  fill={roomColor}
                  stroke={roomColor}
                  strokeWidth="2"
                />
                {beacon && (
                  <Text
                    x={beacon.svgPosition.x}
                    y={beacon.svgPosition.y - 10}
                    textAnchor="middle"
                    fontSize="12"
                    fill="#374151"
                    fontWeight="600"
                  >
                    {beacon.roomName}
                  </Text>
                )}
                {beacon && roomUsers.length > 0 && (
                  <G>
                    <Circle
                      cx={beacon.svgPosition.x + 24}
                      cy={beacon.svgPosition.y - 18}
                      r="10"
                      fill="#10B981"
                    />
                    <Text
                      x={beacon.svgPosition.x + 24}
                      y={beacon.svgPosition.y - 14}
                      textAnchor="middle"
                      fontSize="10"
                      fill="white"
                      fontWeight="bold"
                    >
                      {roomUsers.length}
                    </Text>
                  </G>
                )}
              </G>
            );
          })}
          {/* Render user avatars */}
          {users.map((userData, index) => {
            const beacon = BEACON_DATA.find(b => b.roomId === userData.currentRoom);
            if (!beacon) return null;
            const position = beacon.svgPosition;
            return (
              <UserAvatar
                key={userData.id}
                user={userData}
                position={{
                  x: position.x + (index % 3 - 1) * 18,
                  y: position.y + Math.floor(index / 3) * 18
                }}
                onPress={() => setSelectedUser(userData)}
                isSelected={selectedUser?.id === userData.id}
              />
            );
          })}
          {/* Minimal legend */}
          <G>
            <Text
              x={30}
              y={mapDimensions.height - 10}
              fontSize="10"
              fill="#64748b"
              >
              Numbers show live occupancy
            </Text>
          </G>
        </Svg>
          </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  svg: {
    backgroundColor: 'white',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default IndoorTrackingScreen;