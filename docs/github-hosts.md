# GitHub Hosts 加速配置

## 问题

GitHub 访问慢、丢包率高，影响应用更新下载速度。

## 解决方案

修改 Windows hosts 文件，绑定 GitHub 更快的 IP 地址。

## 操作步骤

### 1. 打开 hosts 文件

以**管理员身份**打开记事本，然后打开文件：
```
C:\Windows\System32\drivers\etc\hosts
```

### 2. 添加以下内容

```hosts
# ========== GitHub Hosts 加速 ==========
# GitHub 主站
20.205.243.166 github.com
140.82.121.3 github.com
140.82.121.6 github.com
20.205.243.166 www.github.com

# GitHub API
140.82.114.4 api.github.com
192.30.253.168 api.github.com

# GitHub 静态资源
185.199.108.153 github.githubassets.com
199.232.69.194 github.githubassets.com

# GitHub Release 下载
185.199.108.133 objects.githubusercontent.com
185.199.109.133 objects.githubusercontent.com
185.199.110.133 objects.githubusercontent.com
185.199.111.133 objects.githubusercontent.com
# =========================================
```

### 3. 保存并刷新 DNS

保存 hosts 文件后，打开命令提示符（管理员），执行：
```cmd
ipconfig /flushdns
```

### 4. 验证配置

```cmd
ping github.com
```

应该看到 IP 变为 `20.205.243.166` 或 `140.82.121.3`，延迟应该明显降低。

## 注意事项

1. **IP 地址会变化**：GitHub 的 IP 可能会变动，如果加速效果变差，需要更新 hosts
2. **需要定期更新**：建议每隔 1-2 个月检查一次 IP 是否有效
3. **备用 IP**：如果某个 IP 不通，可以尝试列表中的其他 IP

## 获取最新 IP

推荐项目：[GitHub520](https://github.com/521xueweihan/GitHub520)

该项目会自动更新 GitHub hosts，可以使用其提供的工具自动更新。

## 取消配置

如果想恢复默认，删除 hosts 文件中 GitHub 相关的行即可。
