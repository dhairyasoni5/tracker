# BLE PLX core
-keep class com.polidea.rxandroidble2.** { *; }
-dontwarn com.polidea.rxandroidble2.**

# Kotlin metadata & classes
-keep class kotlin.** { *; }
-keep class kotlinx.** { *; }
-keep class kotlin.Metadata { *; }
-dontwarn kotlin.**
-dontwarn kotlinx.coroutines.**

# RxJava 2 / RxAndroid (used internally by BLE-PLX)
-keep class io.reactivex.** { *; }
-dontwarn io.reactivex.**

# BLE-PLX's React Native bridge (important!)
-keep class com.polidea.reactnativeble.** { *; }
-dontwarn com.polidea.reactnativeble.**

# Android BLE APIs (defensive)
-keep class android.bluetooth.** { *; }
-dontwarn android.bluetooth.**

# Required for React Native bridge
-keepclassmembers class * extends com.facebook.react.bridge.NativeModule {
  public <init>(...);
}
-keepclassmembers class * extends com.facebook.react.bridge.ReactContextBaseJavaModule {
  public <init>(...);
}
-keep public class * extends com.facebook.react.bridge.ReactPackage
-keepclassmembers class * {
  @com.facebook.react.uimanager.annotations.ReactProp <methods>;
}
-keepclassmembers class * {
  @com.facebook.react.uimanager.annotations.ReactPropGroup <methods>;
}

# Keep annotations and reflection metadata
-keepattributes *Annotation*, InnerClasses, EnclosingMethod

# Debug: helpful to avoid issues
-keepclassmembers class * {
  public *;
}
