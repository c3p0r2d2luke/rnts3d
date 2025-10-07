<?php
// rnts_cool.php
$colors = [
  ["#00ffc8", "#007aff"],
  ["#ff7a18", "#ffca18"],
  ["#b24592", "#f15f79"],
  ["#4facfe", "#00f2fe"],
  ["#43e97b", "#38f9d7"]
];
$pick = $colors[array_rand($colors)];
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown visitor';
$time = date("g:i A");
?>
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Something Cool 😎</title>
<style>
  body {
    margin: 0;
    height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    font-family: "Poppins", sans-serif;
    color: #fff;
    background: linear-gradient(135deg, <?= $pick[0] ?>, <?= $pick[1] ?>);
    transition: background 1s ease;
  }
  h1 { font-size: 2.5rem; margin: 0.2em 0; }
  p { opacity: 0.8; font-size: 1.1rem; }
</style>
</head>
<body>
  <h1>Welcome to RNTS!</h1>
  <p>Hey there, visitor from <strong><?= htmlspecialchars($ip) ?></strong></p>
  <p>The current server time is <strong><?= $time ?></strong></p>
  <p>Refresh the page to see a new gradient ✨</p>
</body>
</html>
