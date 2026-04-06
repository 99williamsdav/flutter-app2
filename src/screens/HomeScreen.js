import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const TODAY = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const NORMAL_URL = () => {
  const date = TODAY();
  return `https://flutterbot.co.uk/api/stats?df=${date}&dt=${date}&groupings=["All"]&dsFilters={Void: false}&specialFilters={}`;
};

const INPLAY_URL = () => {
  const date = TODAY();
  return `https://flutterbot.co.uk/api/stats?df=${date}&dt=${date}&groupings=["All"]&dsFilters={InPlay: true, Void: false}&specialFilters={}`;
};

const SNOWBALL_URL = () => {
  const date = TODAY();
  return `https://snowball.flutterbot.co.uk/api/stats?df=${date}&dt=${date}&groupings=["All"]&dsFilters={Void: false}&specialFilters={}`;
};

const OPEN_URL = 'https://flutterbot.co.uk/api/open';

const FLUTTERBOT_HEADERS = { Referer: 'https://flutterbot.co.uk/' };

const STALE_THRESHOLD_MS = 30000;

function MetricRow({ label, value, stale }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, value && value.startsWith('-') ? styles.negative : styles.positive]}>
        {value}{stale ? ' !' : ''}
      </Text>
    </View>
  );
}

function formatCurrency(value) {
  if (value === null || value === undefined) return '£--.--';
  const abs = Math.abs(value);
  const formatted = abs.toFixed(2);
  return value < 0 ? `-£${formatted}` : `£${formatted}`;
}

function formatTime(date) {
  if (!date) return '--:--';
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function isStale(timestamp) {
  if (!timestamp) return false;
  return Date.now() - timestamp > STALE_THRESHOLD_MS;
}

async function fetchStats(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  const net = data?.All?.[0]?.Net;
  return {
    profit: net?.Profit ?? null,
    cashout: net?.CashoutValueExclLargeSpread ?? null,
    expected: net?.ExpectedProfit ?? null,
  };
}

async function fetchOpenBets() {
  const response = await fetch(OPEN_URL, { headers: FLUTTERBOT_HEADERS });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  let stake = 0;
  for (const bet of data) {
    if (bet.LongShort === 'Long') {
      stake += bet.LongStake || 0;
    } else {
      stake += bet.ShortStake || 0;
    }
  }
  return stake;
}

export default function HomeScreen() {
  const [normalData, setNormalData] = useState(null);
  const [normalTimestamp, setNormalTimestamp] = useState(null);
  const [inplayData, setInplayData] = useState(null);
  const [inplayTimestamp, setInplayTimestamp] = useState(null);
  const [snowballData, setSnowballData] = useState(null);
  const [snowballTimestamp, setSnowballTimestamp] = useState(null);
  const [openStake, setOpenStake] = useState(null);
  const [openTimestamp, setOpenTimestamp] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNormal = useCallback(async () => {
    try {
      const data = await fetchStats(NORMAL_URL(), FLUTTERBOT_HEADERS);
      setNormalData(data);
      setNormalTimestamp(Date.now());
      setLastUpdated(new Date());
    } catch (e) {
      console.warn('Normal stats fetch failed:', e.message);
    }
  }, []);

  const fetchInPlay = useCallback(async () => {
    try {
      const data = await fetchStats(INPLAY_URL(), FLUTTERBOT_HEADERS);
      setInplayData(data);
      setInplayTimestamp(Date.now());
      setLastUpdated(new Date());
    } catch (e) {
      console.warn('InPlay stats fetch failed:', e.message);
    }
  }, []);

  const fetchSnowball = useCallback(async () => {
    try {
      const data = await fetchStats(SNOWBALL_URL());
      setSnowballData(data);
      setSnowballTimestamp(Date.now());
      setLastUpdated(new Date());
    } catch (e) {
      console.warn('Snowball stats fetch failed:', e.message);
    }
  }, []);

  const fetchOpen = useCallback(async () => {
    try {
      const stake = await fetchOpenBets();
      setOpenStake(stake);
      setOpenTimestamp(Date.now());
    } catch (e) {
      console.warn('Open bets fetch failed:', e.message);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchNormal(), fetchInPlay(), fetchSnowball(), fetchOpen()]);
    setLoading(false);
  }, [fetchNormal, fetchInPlay, fetchSnowball, fetchOpen]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  }, [refreshAll]);

  useEffect(() => {
    refreshAll();

    const statsInterval = setInterval(() => {
      fetchNormal();
      fetchInPlay();
      fetchSnowball();
    }, 10000);

    const openInterval = setInterval(() => {
      fetchOpen();
    }, 30000);

    return () => {
      clearInterval(statsInterval);
      clearInterval(openInterval);
    };
  }, [refreshAll, fetchNormal, fetchInPlay, fetchSnowball, fetchOpen]);

  const normalStale = isStale(normalTimestamp);
  const inplayStale = isStale(inplayTimestamp);
  const snowballStale = isStale(snowballTimestamp);

  const grossTotal =
    normalData?.profit !== null && inplayData?.profit !== null && snowballData?.profit !== null
      ? (normalData?.profit ?? 0) + (inplayData?.profit ?? 0) + (snowballData?.profit ?? 0)
      : null;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00d4ff" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00d4ff" />}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Today's Performance</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Normal Bets</Text>
          <MetricRow
            label="Profit"
            value={formatCurrency(normalData?.profit)}
            stale={normalStale}
          />
          <MetricRow
            label="Cashout Value"
            value={formatCurrency(normalData?.cashout)}
            stale={normalStale}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Snowball</Text>
          <MetricRow
            label="Profit"
            value={formatCurrency(snowballData?.profit)}
            stale={snowballStale}
          />
          <MetricRow
            label="Cashout"
            value={formatCurrency(snowballData?.cashout)}
            stale={snowballStale}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>InPlay</Text>
          <MetricRow
            label="Profit"
            value={formatCurrency(inplayData?.profit)}
            stale={inplayStale}
          />
          <MetricRow
            label="Expected"
            value={formatCurrency(inplayData?.expected)}
            stale={inplayStale}
          />
        </View>

        <View style={[styles.card, styles.summaryCard]}>
          <Text style={styles.cardTitle}>Summary</Text>
          <MetricRow
            label="Gross Total"
            value={formatCurrency(grossTotal)}
            stale={normalStale || inplayStale || snowballStale}
          />
          <MetricRow
            label="Open Stake"
            value={formatCurrency(openStake)}
            stale={false}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Last Updated: {formatTime(lastUpdated)}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#ffffff',
    marginTop: 12,
    fontSize: 16,
  },
  content: {
    padding: 16,
  },
  title: {
    color: '#00d4ff',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    marginTop: 8,
  },
  card: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  summaryCard: {
    borderColor: '#00d4ff',
    borderWidth: 2,
  },
  cardTitle: {
    color: '#00d4ff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  label: {
    color: '#a0a0b0',
    fontSize: 14,
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
  },
  positive: {
    color: '#00d4ff',
  },
  negative: {
    color: '#ff6b6b',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  footerText: {
    color: '#a0a0b0',
    fontSize: 12,
  },
});
