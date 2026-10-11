import { View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { Text } from '@/components/ui/text';

// Outer ring = required-dose adherence; optional inner ring = non-required
// (take-as-needed) adherence, drawn in amber. Colors from DESIGN.md 2.5.
function geometry(size: number, strokeWidth: number) {
  const radius = (size - strokeWidth) / 2;
  return { radius, circumference: 2 * Math.PI * radius };
}

export function AdherenceRing({
  percent,
  innerPercent,
  size = 148,
}: {
  percent: number;
  innerPercent?: number;
  size?: number;
}) {
  const strokeWidth = 12;
  const outer = geometry(size, strokeWidth);
  const hasInner = innerPercent !== undefined;
  const innerStroke = 9;
  const innerSize = size - (strokeWidth + 5) * 2;
  const innerOffset = (size - innerSize) / 2;
  const inner = geometry(innerSize, innerStroke);

  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        hasInner
          ? `${percent}% required adherence, ${innerPercent}% non-required adherence today`
          : `${percent}% adherence today`
      }
    >
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={outer.radius} fill="none" stroke="rgba(167,205,240,0.42)" strokeWidth={strokeWidth} />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={outer.radius}
          fill="none"
          stroke="rgba(196,225,250,0.95)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${outer.circumference}`}
          strokeDashoffset={outer.circumference * (1 - percent / 100)}
        />
        {hasInner && (
          <G x={innerOffset} y={innerOffset}>
            <Circle cx={innerSize / 2} cy={innerSize / 2} r={inner.radius} fill="none" stroke="rgba(255,197,66,0.3)" strokeWidth={innerStroke} />
            <Circle
              cx={innerSize / 2}
              cy={innerSize / 2}
              r={inner.radius}
              fill="none"
              stroke="rgba(255,197,66,0.95)"
              strokeWidth={innerStroke}
              strokeLinecap="round"
              strokeDasharray={`${inner.circumference}`}
              strokeDashoffset={inner.circumference * (1 - (innerPercent ?? 0) / 100)}
            />
          </G>
        )}
      </Svg>
      <View className="absolute inset-0 items-center justify-center">
        <Text className="text-3xl font-extrabold text-white dark:text-white">{percent}%</Text>
      </View>
    </View>
  );
}
