var selectedLinkWidth = 1.0;
var linkWidth = 0.3;
var fadedColor = "rgba(204, 204, 204, 1)";
var selectedNode = undefined;
var autoLoginDone = false;
var groups = {};
var regions = {};
var mainGraph = true;
var playerSettingChanged = false;
var playerState = "stopped";
var playerSettingChangedSI = false;
var PlayerStateSI = "stopped";
var mode3D = false;
var allNodes = {};
var allLinks = {};
var graphNodes = {};
var graphLinks = [];
var Graph;
var positions = {'status': '', '2d': {}, '3d': {}};

function b64ToUrlSafeB64(s) {
  const alts = { "/": "_", "+": "-", "=": "" };
  return s.replace(/[/+=]/g, (c) => alts[c]);
}

function hash(data) {
  const h = CryptoJS.SHA256(data);
  const b = h.toString(CryptoJS.enc.Base64);
  return b64ToUrlSafeB64(b);
}

function drawCoordinates(x, y, size) {
    var canvas = document.getElementsByTagName('canvas')[0];
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ff2626"; // Red color
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2, true);
    ctx.fill();
}

var areaPoints = [];
$(document).keyup(function(e) {
  if (e.keyCode != 17){
    return;
  };
  // clear area points from canvas
  Graph.zoom(Graph.zoom());
  const nodes = [];
  for (const id in allNodes) {
    if (inside([allNodes[id].x, allNodes[id].y], areaPoints)) {
      nodes.push(allNodes[id]);
      allNodes[id].selected = true;
    }
  }
  selectNodes(nodes);
  areaPoints = [];
});

function inside(point, vs) {
  var x = point[0], y = point[1];
  var inside = false;
  for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    var xi = vs[i][0], yi = vs[i][1];
    var xj = vs[j][0], yj = vs[j][1];
    var intersect = ((yi > y) != (yj > y))
      && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

async function loadUsers(user, key1, password) {
  $("#logoutFormUserName").text(user.name || "");

  // set the user's name and image
  Object.assign(allNodes[user.id], { name: user.name, img: new Image() });
  let imgData = await localforage.getItem(`explorer_img_${user.id}`);
  if (imgData) {
    allNodes[user.id].img.src = imgData;
    $("#logoutFormImage").attr("src", imgData);
  } else {
    $.get(`/storage/${key1}/${user.id}`, (data) => {
      imgData = CryptoJS.AES.decrypt(data, password).toString(CryptoJS.enc.Utf8);
      localforage.setItem(`explorer_img_${user.id}`, imgData);
      allNodes[user.id].img.src = imgData;
      $("#logoutFormImage").attr("src", imgData);
    });
  }

  // set the connections' name and image
  for (const conn of user.connections || []) {
    // skip conn.id === user.id to solve bugs related to users connected to themselves!
    if (!allNodes[conn.id] || conn.id === user.id) {
      continue;
    }
    $("#searchFieldConnections").append(new Option(conn.name, conn.id));
    Object.assign(allNodes[conn.id], { name: conn.name, img: new Image() });
    let imgData = await localforage.getItem(`explorer_img_${conn.id}`);
    if (imgData) {
      allNodes[conn.id].img.src = imgData;
    } else {
      $.get(`/storage/${key1}/${conn.id}`, (data) => {
        imgData = CryptoJS.AES.decrypt(data, password).toString(CryptoJS.enc.Utf8);
        localforage.setItem(`explorer_img_${conn.id}`, imgData);
        allNodes[conn.id].img.src = imgData;
      });
    }
  }
}

async function loadGroups(user, key1, password) {
  for (const group of user.groups || []) {
    if (!(group.id in groups)) {
      continue;
    }

    if (group.name) {
      $("#searchFieldGroups").append(new Option(group.name, group.id));
    }

    if (!group.url || !group.aesKey) {
      continue;
    }

    Object.assign(groups[group.id], { name: group.name, img: new Image() });
    let imgData = await localforage.getItem(`explorer_img_${group.id}`);
    if (imgData) {
      groups[group.id].img.src = JSON.parse(imgData)?.photo || "";
    } else {
      const url = "/storage/immutable" + group.url.split("immutable")[1];
      $.get(url, (data) => {
        imgData = CryptoJS.AES.decrypt(data, group.aesKey).toString(CryptoJS.enc.Utf8);
        localforage.setItem(`explorer_img_${group.id}`, imgData);
        groups[group.id].img.src = JSON.parse(imgData)?.photo || "";
      });
    }
  }
}

async function loadInfo() {
  autoLoginDone = true;
  let user;
  let key1;
  const code = $("#code").val();
  const password = $("#password").val();;
  let backupData = await localforage.getItem("explorer_backup_data");
  if (backupData) {
    backupData = JSON.parse(backupData);
    user = { id: backupData.id };
    key1 = await localforage.getItem("explorer_key1");
  } else {
    if (code.indexOf("==") > -1) {
      const brightid = CryptoJS.AES.decrypt(code, password).toString(CryptoJS.enc.Utf8);
      user = { id: brightid };
    } else {
      user = { id: code };
    }
    key1 = hash(user.id + password);
    localforage.setItem("explorer_key1", key1);
    await $.get(`/storage/${key1}/data`)
      .done((data) => {
        backupData = CryptoJS.AES.decrypt(data, password).toString(CryptoJS.enc.Utf8);
        if (!backupData) {
          return alert("No backup found");
        }
      })
      .fail(() => {
        return alert("Invalid explorer code or password or backup not available");
      })
    localforage.setItem("explorer_backup_data", backupData);
    backupData = JSON.parse(backupData);
  }
  $("#loginForm").hide();
  $("#logoutForm").show();
  Object.assign(user, {
    ...backupData.userData,
    connections: backupData.connections,
    groups: backupData.groups,
  });
  await loadGroups(user, key1, password);
  await loadUsers(user, key1, password);
  selectNode(allNodes[user.id], true);
}

function resetLinksColor(link) {
  if (link.level == "recovery") return "blue";
  else if (link.level == "already known") return "green";
  else if (link.level == "just met") return "yellow";
  else if (link.level == "suspicious") return "orange";
  else if (link.level == "reported") return "red";
  else return "black";
}

function resetNodesColor(n) {
  if (n.selected) return "red";
  else if (n.node_type == "Seed") return "blue";
  else if (n.verifications && "BrightID" in n.verifications) return "green";
  else return "yellow";
}

function copyBrightid() {
  $("#brightidField").select();
  document.execCommand("copy");
}

function showUser() {
  const node = allNodes[$("#seedConnected").val()];
  selectNode(node, true);
}

function showMember() {
  const node = allNodes[$("#members").val()];
  selectNode(node, true);
}

function selectNeighbor() {
  const node = allNodes[$("#neighbors").val()];
  selectNode(node, true, true);
}

function showNeighborDetails() {
  const node = allNodes[$("#neighbors").val()];
  const fTime = selectedNode.neighbors[node.id].fTime;
  const tTime = selectedNode.neighbors[node.id].tTime;
  $("#neighbor").html(node.id);
  $("#outboundLevel").html(selectedNode.neighbors[node.id].fLevel || "__");
  $("#outboundTime").html(fTime ? new Date(fTime).toJSON().split("T")[0] : "__");
  $("#inboundLevel").html(selectedNode.neighbors[node.id].tLevel || "__");
  $("#inboundTime").html(tTime ? new Date(tTime).toJSON().split("T")[0] : "__");
  $("#neighborContainer").show();
  move(node.x, node.y, 1.2);
}

function copyGroupId() {
  $("#groupIdField").select();
  document.execCommand("copy");
}

function showGroup() {
  selectGroup($("#groups").val(), true);
}

function move(x, y, z) {
  if (mode3D) {
    const distance = 40;
    const distRatio = 1 + distance / Math.hypot(x, y, z);

    Graph.cameraPosition({ x: x * distRatio, y: y * distRatio, z: z * distRatio }, { x, y, z }, // lookAt ({ x, y, z })
      3000 // ms transition duration
    );

  } else {
    Graph.centerAt(x + 200, y);
    Graph.zoom(z, 2000);
  }
}

function selectGroup(id, showDetails) {
  $("#groupQuotaContainer").hide();
  $("#groupNameContainer").hide();
  $("#groupSeedConnectedDiv").hide();
  $("#groupDetailsPlaceHolder").hide();
  $("#groupDetailsContent").show();

  $("#groupIdText").html(id);
  $("#groupIdField").val(id);

  const group = groups[id];
  if (!mainGraph && !group.seed) {
    drawMainGraph();
    mainGraph = true;
  }

  if (!group.seed) {
    Graph.linkColor(fadedColor);
    Graph.nodeColor(n => group.members.includes(n.id) ? resetNodesColor(n) : fadedColor);
  }

  if (group.region || group.name) {
    $("#groupName").html(group.region || group.name);
    $("#groupNameContainer").show();
  }

  if (group.img && group.img.src && group.img.src.includes("base64")) {
    $("#groupImg").attr("src", group.img.src);
  } else {
    $("#groupImg").attr("src", "");
  }

  const subgraphNodes = {};
  const subgraphLinks = [];
  $("#groupMembersCount").html(group.members.length);
  $("#members").empty().append(new Option("", "none"));
  for (const member of group.members) {
    $("#members").append(new Option(allNodes[member].name || member, member));
    subgraphNodes[member] = allNodes[member];
  }

  if (group.seedConnected.length > 0) {
    $("#seedConectedCount").html(group.seedConnected.length);
    $("#seedConnected").empty().append(new Option("", "none"));
    for (const u of group.seedConnected) {
      $("#seedConnected").append(new Option(allNodes[u].name || u, u));
      subgraphNodes[u] = allNodes[u];
    }
    $("#groupSeedConnectedDiv").show();
    Object.values(allLinks).forEach((link) => {
      if (link.source.id in subgraphNodes && link.target.id in subgraphNodes) {
        subgraphLinks.push(link);
      }
    });
  }

  if (group.seed) {
    mainGraph = false;
    Graph.nodeColor(n => group.members.includes(n.id) || group.seedConnected.includes(n.id) ? resetNodesColor(n) : fadedColor);
    $("#groupQuota").html(group.quota);
    $("#groupQuotaContainer").show();
    for (const u of Object.keys(subgraphNodes)) {
      // delete subgraphNodes[u].x;
      // delete subgraphNodes[u].y;
      // delete subgraphNodes[u].z;
      delete subgraphNodes[u].fx;
      delete subgraphNodes[u].fy;
      delete subgraphNodes[u].fz;
    }
    if ($("#3dBtn").is(":checked")) {
      draw3dGraph({ nodes: Object.values(subgraphNodes), links: subgraphLinks }, true);
    } else {
      drawGraph({ nodes: Object.values(subgraphNodes), links: subgraphLinks }, true);
    }
  }

  if (showDetails) {
    openCollapsible("groupDetails", true);
  }

  let sumX = 0;
  let sumY = 0;
  for (const member of group.members) {
    sumX += allNodes[member].x;
    sumY += allNodes[member].y;
  }
  const n = group.members.length;
  move(sumX / n, sumY / n, .2);
}

function selectVerification(verification) {
  const verifieds = {};
  if (verification.startsWith("Rank ")) {
    const rank = parseInt(verification.replace("Rank ", "").replace("+", ""));
    for (const id in allNodes) {
      if (
        "Yekta" in allNodes[id].verifications &&
        allNodes[id].verifications.Yekta.rank >= rank
      ) {
        verifieds[id] = true;
      }
    }
  } else {
    for (const id in allNodes) {
      if (verification in allNodes[id].verifications) {
        verifieds[id] = true;
      }
    }
  }
  Graph.nodeColor(n => n.id in verifieds ? resetNodesColor(n) : fadedColor);
  Graph.linkColor(fadedColor);
}

function selectRegion(name) {
  if (name == "Complete Graph") {
    const centerNode = allNodes["AsjAK5gJ68SMYvGfCAuROsMrJQ0_83ZS92xy94LlfIA"];
    Graph.nodeColor(resetNodesColor);
    Graph.linkColor(resetLinksColor);
    return move(centerNode.x, centerNode.y, 0.7);
  }
  if (regions[name].length == 1 && groups[regions[name][0]]) {
    selectGroup(regions[name][0], true);
  } else {
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    const members = [];
    for (const id of regions[name]) {
      if (allNodes[id]) {
        members.push(id);
      } else if (groups[id]) {
        for (const member of groups[id].members) {
          members.push(member);
        }
      }
    }
    for (const id of members) {
      sumX += allNodes[id].x;
      sumY += allNodes[id].y;
    }
    Graph.nodeColor(n => members.includes(n.id) ? resetNodesColor(n) : fadedColor);
    Graph.linkColor(fadedColor);
    const n = members.length;
    move(sumX / n, sumY / n, 1.2);
  }
}

function getGroupName(group) {
  return groups[group]?.region || groups[group]?.name || group;
}

function getConnText(neighbor, conn) {
  let connTime, fLevel, tLevel;
  if (conn.fTime && conn.tTime) {
    if (Math.abs(conn.fTime - conn.tTime) > 24 * 60 * 60 * 1000) {
      connTime = `${new Date(conn.fTime).toJSON().split("T")[0]} | ${new Date(conn.tTime).toJSON().split("T")[0]}`
    } else {
      connTime = new Date(conn.fTime).toJSON().split("T")[0];
    }
  } else {
      connTime = new Date(conn.fTime || conn.tTime).toJSON().split("T")[0];
  }
  if (conn.fLevel) {
    if (conn.fLevel == 'reported') {
      fLevel = 'reported';
    } else {
      fLevel = conn.fLevel[0].toUpperCase();
    }
  } else {
    fLevel = '_'
  }
  if (conn.tLevel) {
    if (conn.tLevel == 'reported') {
      tLevel = 'reported';
    } else {
      tLevel = conn.tLevel[0].toUpperCase();
    }
  } else {
    tLevel = '_'
  }
  let text = `${allNodes[neighbor]?.name || neighbor} | ${fLevel} | ${tLevel} | ${connTime}`
  if (allNodes[neighbor].node_type == "Seed") {
    text = `* ${text}`;
  }
  return text;
}

function selectNodes(nodes) {
  $("#userDetailsContent").show();
  $("#seedData").hide();
  $("#userNameContainer").hide();
  $("#userRecoveryContainer").hide();
  $("#userDetailsPlaceHolder").hide();
  $("#neighborsContainer").hide();
  $("#neighborContainer").hide();
  openCollapsible("userDetails", true);

  const allHighlightedNodes = new Set([]);
  const allHighlightLinks = new Set();
  $("#brightidText").html(nodes.map(n => n.id).join('<br/>'));
  nodes.forEach(node => {
    highlightNodes = new Set([node.id]);
    Object.keys(node.neighbors).forEach(n1 => {
      if (!selectedLevels.includes(node.neighbors[n1].fLevel) || !selectedLevels.includes(node.neighbors[n1].tLevel)) {
        return;
      }
      highlightNodes.add(n1);
    });
    const highlightLinks = new Set();
    Object.values(graphLinks).forEach(l => {
      if (l.source.id != node.id && l.target.id != node.id) {
        return;
      }
      if (highlightNodes.has(l.source.id) && highlightNodes.has(l.target.id)) {
        highlightLinks.add(l);
      }
    });
    highlightNodes.forEach(n => allHighlightedNodes.add(n));
    highlightLinks.forEach(l => allHighlightLinks.add(l));
  });
  Graph.linkVisibility(l => (allHighlightLinks.has(l) ? true : false));
  Graph.nodeColor(n => allHighlightedNodes.has(n.id) ? resetNodesColor(n) : fadedColor)
    .linkDirectionalArrowLength(l => allHighlightLinks.has(l) ? 6 : 2)
    .linkColor(l => allHighlightLinks.has(l) ? resetLinksColor(l) : fadedColor);
}

function selectNode(node, showDetails, focus) {
  $("#userDetailsContent").show();
  $("#seedData").hide();
  $("#userNameContainer").hide();
  $("#userRecoveryContainer").hide();
  $("#userDetailsPlaceHolder").hide();
  $("#neighborsContainer").hide();
  $("#neighborContainer").hide();

  for (const id in graphNodes) {
    graphNodes[id].selected = false;
  }
  node.selected = true;
  selectedNode = node;
  $("#brightidText").html(node.id);
  $("#brightidField").val(node.id);
  $("#nodeCreatedAt").html(new Date(node.createdAt).toJSON().split("T")[0]);
  $("#recoveryIn").html(node.statistics["inbound"]["recovery"]);
  $("#recoveryOut").html(node.statistics["outbound"]["recovery"]);
  $("#alreadyKnownIn").html(node.statistics["inbound"]["already known"]);
  $("#alreadyKnownOut").html(node.statistics["outbound"]["already known"]);
  $("#justMetIn").html(node.statistics["inbound"]["just met"]);
  $("#justMetOut").html(node.statistics["outbound"]["just met"]);
  $("#suspiciousIn").html(node.statistics["inbound"]["suspicious"]);
  $("#suspiciousOut").html(node.statistics["outbound"]["suspicious"]);
  $("#reportedIn").html(node.statistics["inbound"]["reported"]);
  $("#reportedOut").html(node.statistics["outbound"]["reported"]);

  if (node.node_type == "Seed") {
    $("#quotaValue").html(node.quota);
    $("#noSeedGroups").html(node.seed_groups.length);
    $("#seedData").show();
  }

  if (node.name) {
    $("#userName").html(node.name);
    $("#userNameContainer").show();
  }

  $("#userImage").attr("src", node?.img?.src || "");
  const neighborsCount = Object.keys(node.neighbors).length;
  if (neighborsCount > 0) {
    $("#neighborsCount").html(neighborsCount);
    $("#neighbors").empty().append(new Option("", "none"));
    Object.keys(node.neighbors).forEach(n => {
      const connText = getConnText(n, node.neighbors[n]);
      $("#neighbors").append(new Option(connText, n));
    })
    $("#neighborsContainer").show();
  }

  // if (node.statistics.recoveries.length > 0) {
  //   $("#userRecoveries").empty();
  //   node.statistics.recoveries.forEach((tid) => {
  //     const text = allNodes[tid]?.name || tid;
  //     $('<li class="text-white" style="font-size: 12px;">').text(text).appendTo("#userRecoveries");
  //   });
  //   $("#userRecoveryContainer").show();
  // }

  let verificationsString = "";
  for (const name in node.verifications) {
    if (node.verifications[name].app) {
      continue;
    }
    const details = [];
    for (let [key, value] of Object.entries(node.verifications[name])) {
      if (["timestamp", "hash", "block"].includes(key)) {
        continue;
      } else if (!value && key == "friend") {
        continue;
      } else if (["reported", "connected"].includes(key) && value.length == 0) {
        continue;
      } else if (key == "connected") {
        const seedGroups = [];
        for (const groupId of value) {
          seedGroups.push(groups[groupId].region ? groups[groupId].region : groupId);
        }
        value = seedGroups.join(", ");
      } else if (key == "reported") {
        const seedGroups = [];
        for (const groupId of value) {
          seedGroups.push(groups[groupId].region ? groups[groupId].region : groupId);
        }
        value = seedGroups.join(", ");
      } else if (key == "raw_rank") {
        value = value.toFixed(2);
      }
      details.push(`${key}: ${value}`);
    }
    verificationsString += `<b>${name}</b> ${details.join(", ")}<br/>`;
  }
  $("#verifications").html(verificationsString);

  $("#groups").empty().append(new Option("", "none"));
  $('#groupsCount').html(node.groups.length);
  for (const group of node.groups) {
    $("#groups").append(new Option(getGroupName(group), group));
  }

  const highlightNodes = new Set([node.id]);
  Object.keys(node.neighbors).forEach(n1 => {
    if (!selectedLevels.includes(node.neighbors[n1].fLevel) || !selectedLevels.includes(node.neighbors[n1].tLevel)) {
      return;
    }
    highlightNodes.add(n1);
    // const neighborsOfNeighbor = Object.keys(allNodes[n1].neighbors);
    // if (neighborsOfNeighbor.length < 100) {
    //   neighborsOfNeighbor.forEach(n2 => {
    //     if (!selectedLevels.includes(allNodes[n1].neighbors[n2].fLevel) || !selectedLevels.includes(allNodes[n1].neighbors[n2].tLevel)) {
    //       return;
    //     }
    //     highlightNodes.add(n2)
    //   });
    // }
  });
  const highlightLinks = new Set();
  Object.values(graphLinks).forEach(l => {
    if (l.source.id != node.id && l.target.id != node.id) {
      return;
    }
    if (highlightNodes.has(l.source.id) && highlightNodes.has(l.target.id)) {
      highlightLinks.add(l);
    }
  });
  Graph.linkVisibility(l => (highlightLinks.has(l) ? true : false));
  Graph.nodeColor(n => highlightNodes.has(n.id) ? resetNodesColor(n) : fadedColor)
    .linkDirectionalArrowLength(l => highlightLinks.has(l) ? 6 : 2)
    .linkColor(l => highlightLinks.has(l) ? resetLinksColor(l) : fadedColor);

  if (showDetails) {
    openCollapsible("userDetails", true);
  }

  if (focus === undefined || focus === true) {
    move(node.x, node.y, 1.2);
  }
}

function updateStatistics() {
  let numVerifieds = numSeeds = numNeighbors = 0;
  Object.keys(graphNodes).forEach((id) => {
    const node = allNodes[id];
    if (node.verifications && "BrightID" in node.verifications) {
      numVerifieds++;
      numNeighbors += Object.keys(node.neighbors).length;
    }
    if (node.node_type == "Seed") {
      numSeeds++;
    }
  });
  $("#numNodes").html(Object.keys(graphNodes).length);
  $("#numVerifieds").html(numVerifieds);
  $("#numSeeds").html(numSeeds);
  $("#averageConnection").html(Math.ceil(numNeighbors / numVerifieds));
}

function setPosition(graphType) {
  const predefinedPosition = $("#predefinedPosition").is(":checked");
  if (!predefinedPosition) {
    if (positions['status'] != 'noPosition') {
      for (let n of Object.values(graphNodes)) {
        delete n.x;
        delete n.y;
        delete n.z;
        delete n.fx;
        delete n.fy;
        delete n.fz;
      }
      positions['status'] = 'noPosition';
    }
  } else if (graphType == '2d') {
    if (positions['status'] != '2d') {
      for (let n of Object.values(graphNodes)) {
        if (n.id in positions['2d']) {
          n.fx = positions['2d'][n.id].x;
          n.fy = positions['2d'][n.id].y;
        }
      }
      positions['status'] = '2d';
    }
  } else if (graphType == '3d') {
    if (positions['status'] != '3d') {
      for (let n of Object.values(graphNodes)) {
        if (n.id in positions['3d']) {
          n.fx = positions['3d'][n.id].x;
          n.fy = positions['3d'][n.id].y;
          n.fz = positions['3d'][n.id].z;
        }
      }
      positions['status'] = '3d';
    }
  }
}

function drawGraph(data, subgraph) {
  setPosition('2d');
  const cooldownTime = $("#cooldownTime").val() * 1000;
  for (let l of data.links) {
    if (!l.__indexColor) {
      l.__indexColor = resetLinksColor(l);
    }
  }
  $("#graphDiv").empty();
  const elem = document.getElementById("graphDiv");
  Graph = ForceGraph()(elem)
    .cooldownTime(cooldownTime)
    .enableNodeDrag(false)
    .linkColor(resetLinksColor)
    .nodeColor(resetNodesColor)
    .graphData(data)
    .nodeId("id")
    .nodeVal("size")
    .nodeLabel("id")
    .linkWidth(linkWidth)
    .linkSource("source")
    .linkTarget("target")
    .onNodeClick((node) => {
      console.log(node);
      if (node.id != selectNode) {
        selectNode(node, true, false);
      }
    })
    .linkVisibility((link) => subgraph ? true : false)
    .onBackgroundClick((evt) => {
      if (evt.ctrlKey) {
        const p = Graph.screen2GraphCoords(evt.layerX, evt.layerY);
        var rect = document.getElementById('graphDiv').getBoundingClientRect();
        drawCoordinates(p.x, p.y, 5 / (Graph.zoom()**.5));
        areaPoints.push([p.x, p.y]);
        return;
      }

      for (const id in graphNodes) {
        graphNodes[id].selected = false;
      }
      selectedNode = undefined;
      Graph.linkWidth(linkWidth)
        .nodeColor(resetNodesColor)
        .linkColor(resetLinksColor)
        .linkDirectionalArrowLength(6);
    })
    .nodeCanvasObjectMode(() => "after")
    .linkDirectionalArrowLength(6)
    .nodeCanvasObject((n, ctx) => {
      const size = 30;
      if (n.img) {
        ctx.lineWidth = 5;
        ctx.save();
        ctx.beginPath();
        ctx.arc(n.x, n.y, size / 2, 0, Math.PI * 2, true);
        ctx.clip();
        ctx.strokeStyle = resetNodesColor(n);
        try {
          ctx.drawImage(n.img, n.x - size / 2, n.y - size / 2, size, size);
        } catch (err) {
          console.log("Error in drawImage: ", err)
        }
        ctx.stroke();
        ctx.restore();
      }
    })
    .onEngineStop(async () => {
      if ((await localforage.getItem("explorer_backup_data")) && !autoLoginDone) {
        loadInfo();
      }
    });
}

function draw3dGraph(data, subgraph) {
  setPosition('3d');
  const cooldownTime = $("#cooldownTime").val() * 1000;
  $("#graphDiv").empty();
  const elem = document.getElementById("graphDiv");
  Graph = ForceGraph3D()(elem)
    .cooldownTime(cooldownTime)
    .enableNodeDrag(false)
    .linkColor(resetLinksColor)
    .nodeColor(resetNodesColor)
    .graphData(data)
    .nodeOpacity(1)
    .nodeLabel(n => n.id)
    .nodeId("id")
    .nodeVal("size")
    .linkWidth(linkWidth)
    .linkSource("source")
    .linkTarget("target")
    .onNodeClick((node) => {
      if (!node.selected) {
        selectNode(node, true, false);
      }
    })
    .linkVisibility((link) => subgraph ? true : false)
    .onBackgroundClick(() => {
      for (const id in graphNodes) {
        graphNodes[id].selected = false;
      }
      selectedNode = undefined;
      Graph.linkWidth(linkWidth)
        .nodeColor(resetNodesColor)
        .linkColor(resetLinksColor)
        .linkDirectionalArrowLength(6);
    })
    .linkDirectionalArrowLength(6)
}

function logPositions2d() {
  const pos = {};
  Object.values(graphNodes).forEach(node => {
    if (!('x' in node) || !('y' in node)) {
      return;
    }
    if (Date.now() - 10 * 24 * 60 * 60 * 1000 > node.createdAt) {
      pos[node.id] = { x: node.x, y: node.y };
    }
  });
  console.log(`nodes: ${Object.keys(pos).length}`);
  console.log(pos);
}

function logPositions3d() {
  const pos = {};
  Object.values(graphNodes).forEach(node => {
    if (!('x' in node) || !('y' in node) || !('z' in node)) {
      return;
    }
    if (Date.now() - 10 * 24 * 60 * 60 * 1000 > node.createdAt) {
      pos[node.id] = { x: node.x, y: node.y, z: node.z };
    }
  });
  console.log(`nodes: ${Object.keys(pos).length}`);
  console.log(pos);
}

function rotate(degree) {
  let maxX = 0;
  let minX = 0;
  let maxY = 0;
  let minY = 0;
  Object.values(graphNodes).forEach(node => {
    if (maxX < node.x) maxX = node.x;
    if (minX > node.x) minX = node.x;
    if (maxY < node.y) maxY = node.y;
    if (minY < node.y) minY = node.y;
  });
  const cX = (maxX - minX) / 2;
  const cY = (maxY - minY) / 2;
  const r = degree * (Math.PI / 180);
  Object.values(graphNodes).forEach(node => {
    const newX = (node.x - cX) * Math.cos(r) - (node.y - cY) * Math.sin(r) + cX;
    const newY = (node.x - cX) * Math.sin(r) + (node.y - cY) * Math.cos(r) + cY;
    node.fx = newX;
    node.fy = newY;
  });
  drawGraph({ nodes: Object.values(graphNodes), links: Object.values(graphLinks) }, false);
}

function drawMainGraph() {
  drawGraph({ nodes: Object.values(graphNodes), links: graphLinks }, false);
}

function drawMain3dGraph() {
  draw3dGraph({ nodes: Object.values(graphNodes), links: graphLinks }, false);
}

function updateGraphData(index) {
  graphNodes = {};
  graphLinks = [];
  const connectionLevels = ["suspicious", "just met", "already known", "recovery"];
  selectedLevels = connectionLevels.slice(index, 4);

  Object.values(allLinks).forEach(l => {
    if (!(selectedLevels.includes(l.level))) {
      return;
    }

    const s = l.source?.id || l.source;
    const t = l.target?.id || l.target
    const otherSideLevel = allLinks[`${t}${s}`]?.level;
    if (!(selectedLevels.includes(otherSideLevel))) {
      return;
    }

    graphLinks.push(l);
    if (!(s in graphNodes)) {
      graphNodes[s] = allNodes[s];
    }
    if (!(t in graphNodes)) {
      graphNodes[t] = allNodes[t];
    }
  });
  updateStatistics();
}

$(document).ready(function() {
  $.get("positions2d.json", function(data) {
    positions['2d'] = data;
  });

  $.get("positions3d.json", function(data) {
    positions['3d'] = data;
  });

  $.get("brightid.json", function(data) {
    // data = JSON.parse(data);
    data.links.forEach(l => {
      allLinks[`${l.source}${l.target}`] = {...l, '__indexColor': '#000000'};
    });

    data.groups.forEach(group => {
      groups[group.id] = {...group, members: [], seedConnected: [] };
      const region = group.region;
      if (region) {
        if (!(region in regions)) {
          regions[region] = [];
        }
        if (!regions[region].includes(group.id)) {
          regions[region].push(group.id);
          $("#searchFieldRegions").append(new Option(region, region));
        }
      }
    });

    data.nodes.forEach(node => {
      node.neighbors = {};
      node.statistics = data.users_statistics[node.id];
      allNodes[node.id] = node;

      node.groups.forEach(group => groups[group].members.push(node.id));
      if (node.verifications.SeedConnected) {
        for (const sg of node.verifications.SeedConnected.connected) {
          groups[sg].seedConnected.push(node.id);
        }
      }
    });

    Object.values(allLinks).forEach(l => {
      if (!(l.target in allNodes[l.source].neighbors)) {
        allNodes[l.source].neighbors[l.target] = {};
      }
      allNodes[l.source].neighbors[l.target]["fLevel"] = l.level;
      allNodes[l.source].neighbors[l.target]["fTime"] = l.timestamp;
      if (!(l.source in allNodes[l.target].neighbors)) {
        allNodes[l.target].neighbors[l.source] = {};
      }
      allNodes[l.target].neighbors[l.source]["tLevel"] = l.level;
      allNodes[l.target].neighbors[l.source]["tTime"] = l.timestamp;
    });

    updateGraphData(2);
    drawMainGraph();
  });

  $("#searchField").change(function() {
    const val = $("#searchField").val();
    if (!val) {
      return;
    }
    const id = val.trim();
    if (
      ["BrightID", "SeedConnected", "DollarForEveryone", "SocialRecoverySetup"].includes(id) ||
      id.startsWith("Rank ")
    ) {
      selectVerification(id);
    } else if (allNodes[id]) {
      selectNode(allNodes[id], true);
    } else if (groups[id]) {
      selectGroup(id, true);
    } else if (regions[id] || id == "Complete Graph") {
      selectRegion(id);
    } else {
      return;
    }
  });

  $("#groups").change(function() {
    const id = $(this).val();
    selectGroup(id, false);
  });

  $("#members").change(function() {
    const id = $(this).val();
    selectNode(allNodes[id], false);
  });

  $("#seedConnected").change(function() {
    const id = $(this).val();
    selectNode(allNodes[id], false);
  });

  $("#logoutBtn").click(() => {
    localforage.clear().then(() => {
      location.reload();
    });
  });
  $("#login").click(loadInfo);
  $("#showGroup").click(showGroup);
  $("#copyBrightid").click(copyBrightid);
  $("#showMember").click(showMember);
  $("#showUser").click(showUser);
  $("#copyGroupId").click(copyGroupId);
  $("#searchField").select2({ tags: true });
  $("#dateRange").change(setDateRange);
  $("#fromDate").change(() => playerSettingChanged = true);
  $("#toDate").change(() => playerSettingChanged = true);
  $("#delay").change(() => playerSettingChanged = true);
  $("#playBtn").click(playBtnUI);
  $("#stopBtn").click(stopBtnUI);
  $("#previousBtn").click(previousBtnUI);
  $("#nextBtn").click(nextBtnUI);

  $("#dateRangeSI").change(setDateRangeSI);
  $("#fromDateSI").change(() => playerSettingChangedSI = true);
  $("#toDateSI").change(() => playerSettingChangedSI = true);
  $("#delaySI").change(() => playerSettingChangedSI = true);
  $("#playBtnSI").click(playBtnSI);
  $("#stopBtnSI").click(stopBtnSI);
  $("#previousBtnSI").click(previousBtnSI);
  $("#nextBtnSI").click(nextBtnSI);
  $("#resetBtn").click(() => {
    $('#3dBtn').prop('checked', false);
    $("#levelsRange").val(2);
    $("#connectionLevel").html("Already Known");
    updateGraphData(2);
    stopBtnSI();
    stopBtnUI();
  });
  $("#selectNeighbor").click(selectNeighbor)
  $("#neighbors").change(showNeighborDetails);
  $("#3dBtn").click(() => {
    if ($("#3dBtn").is(":checked")) {
      mode3D = true;
      drawMain3dGraph();
    } else {
      mode3D = false;
      drawMainGraph();
    }

  })
  $("#levelsRange").change(() => {
    const levelIndex = $("#levelsRange").val();
    const connectionLevels = ["Suspicious", "Just Met", "Already Known", "Recovery"];
    $("#connectionLevel").html(connectionLevels[levelIndex]);
  });

  $("#drawGustomGraph").click(() => {
    const levelIndex = $("#levelsRange").val();
    updateGraphData(levelIndex);
    if ($("#3dBtn").is(":checked")) {
      draw3dGraph({ nodes: Object.values(graphNodes), links: graphLinks }, false);
    } else {
      drawGraph({ nodes: Object.values(graphNodes), links: graphLinks }, false);
    }
  });
});