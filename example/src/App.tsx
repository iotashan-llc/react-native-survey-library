import { StyleSheet, Text, View } from 'react-native';
import { LIBRARY_NAME } from '@iotashan-llc/react-native-survey-library';

export default function App() {
  return (
    <View style={styles.container}>
      <Text>{LIBRARY_NAME}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
