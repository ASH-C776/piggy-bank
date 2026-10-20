package com.piggybank.app;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // 开启 WebView 远程调试，便于排查 App 内请求（内网工具，无需关闭）
    WebView.setWebContentsDebuggingEnabled(true);
    // 注意：这里曾经试过 WindowCompat.setDecorFitsSystemWindows(false) 做沉浸式
    // （WebView 画到状态栏底下），MIUI 上窗口动画明显掉帧，已在 1.3.3 撤掉。
    // 系统栏配色统一在 styles.xml 用实色管理，别再这里动 decorFits。
    super.onCreate(savedInstanceState);
  }
}
