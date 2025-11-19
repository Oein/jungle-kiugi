import type { NotificationManager } from "./notifier";
import notifier from "./notifier";

function Leaderboard(props: {
  getGameRunning: () => boolean;
  notifier: NotificationManager;
  kvAPIKey: string;
}) {
  class OnKV {
    skv: string;
    constructor(skv: string) {
      this.skv = skv;
    }
    get__(key: string) {
      return fetch(
        `https://keyvalue.immanuel.co/api/KeyVal/GetValue/${this.skv}/${key}`
      )
        .then((res) => res.text())
        .then((res) => JSON.parse(res));
    }
    set__(key: string, value: any) {
      return fetch(
        `https://keyvalue.immanuel.co/api/KeyVal/UpdateValue/${this.skv}/${key}/${value}`,
        {
          method: "POST",
        }
      );
    }
    async get(key: string) {
      // it has 60 chars limit
      // so it should be saved as parts
      const updatingNotifi = notifier.show(
        `리더보드 불러오는중...`,
        Number.MAX_SAFE_INTEGER
      );

      const parts = await this.get__(key + "_l").then((res) => {
        const length = parseInt(res, 10);
        const parts = [];
        for (let i = 0; i < length; i++) {
          parts.push(
            new Promise<any>((resolve) => {
              this.get__(key + "_" + i).then((res) => {
                resolve(res);
                notifier.update(
                  updatingNotifi,
                  `리더보드 불러오는중... ${i + 1} / ${length}`,
                  Number.MAX_SAFE_INTEGER
                );
              });
            })
          );
        }
        console.log(res, length, parts);
        notifier.update(updatingNotifi, `리더보드 불러오는중... 완료!`, 2000);
        return Promise.all(parts);
      });
      console.log(parts.join(""), parts);
      return JSON.parse(decodeURIComponent(atob(parts.join(""))));
    }
    async set(key: string, value: any) {
      const updatingNotifi = notifier.show(
        `리더보드 저장하는중...`,
        Number.MAX_SAFE_INTEGER
      );
      const toSave = btoa(encodeURIComponent(JSON.stringify(value)));
      const parts = [];
      const SPILIT_BY = 50;
      for (let i = 0; i < toSave.length; i += SPILIT_BY) {
        parts.push(toSave.substring(i, i + SPILIT_BY));
      }
      console.log("Saving of", key, "in", parts.length, "parts");

      await this.set__(key + "_l", parts.length);
      let sent = 0;
      await Promise.all(
        parts.map((part, i) => {
          this.set__(key + "_" + i, part);
          sent++;
          notifier.update(
            updatingNotifi,
            `리더보드 저장하는중... ${sent} / ${parts.length}`,
            Number.MAX_SAFE_INTEGER
          );
          console.log("Saved part of", key, i + 1, " / ", parts.length);
        })
      );

      notifier.update(updatingNotifi, `리더보드 저장 완료!`, 2000);
    }
  }
  const kv = new OnKV(props.kvAPIKey);
  (window as any).kv = kv;

  class LeaderboardList {
    list: [string, number, string][];
    constructor() {
      this.list = [];
    }
    add(name: string, score: number, additionalData: string): boolean {
      if (name.includes("|") || name.includes(",")) {
        throw new Error("Name cannot include | or , characters.");
      }
      const lsc = this.lastScore();
      if (score <= lsc && this.list.length >= 10) return false;
      this.list.push([name, score, additionalData]);
      this.list.sort((a, b) => b[1] - a[1]);
      if (this.list.length > 10) this.list = this.list.slice(0, 10);
      return true;
    }
    getList() {
      return this.list;
    }
    setList(list: [string, number, string][]) {
      this.list = list;
    }
    number2base64(num: number) {
      const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      let result = "";
      do {
        result = chars[num % 64] + result;
        num = Math.floor(num / 64);
      } while (num > 0);
      return result;
    }
    base64ToNumber(str: string) {
      const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      let result = 0;
      for (let i = 0; i < str.length; i++) {
        result = result * 64 + chars.indexOf(str[i]);
      }
      return result;
    }
    serialize() {
      return this.list
        .map((item) => {
          return `${item[0]}|${item[1].toString(36)}|${item[2]}`;
        })
        .join(",");
    }
    deserialize(data: string) {
      console.log("DESERIAL", data);
      if (data == "") {
        return this.setList([]);
      }
      const list: [string, number, string][] = data.split(",").map((item) => {
        const parts = item.split("|");
        return [parts[0], parseInt(parts[1], 36), parts[2]];
      });
      console.log("RES", list);
      this.setList(list);
    }
    lastScore() {
      if (this.list.length === 0) return 0;
      return this.list[this.list.length - 1][1];
    }
  }

  const drawer = document.createElement("div");
  drawer.id = "leaderboard-drawer";
  drawer.className = "drawer";

  const drawerContent = document.createElement("div");
  drawerContent.className = "drawer-content";

  const title = document.createElement("h2");
  title.id = "lbd-title";
  title.innerText = "리더보드";

  const leaderboardList = document.createElement("div");
  leaderboardList.id = "leaderboard-list";
  const loadingText = document.createElement("p");
  loadingText.className = "loading-text";
  loadingText.innerText = "점수를 불러오는 중...";
  leaderboardList.appendChild(loadingText);

  drawerContent.appendChild(title);
  drawerContent.appendChild(leaderboardList);
  drawer.appendChild(drawerContent);

  const drawerToggle = document.createElement("button");
  drawerToggle.id = "drawer-toggle";
  drawerToggle.className = "drawer-toggle";
  const toggleIcon = document.createElement("span");
  toggleIcon.className = "toggle-icon";
  toggleIcon.innerText = "›";
  drawerToggle.appendChild(toggleIcon);
  drawer.appendChild(drawerToggle);

  drawerToggle.addEventListener("click", () => {
    if (props.getGameRunning()) return drawer.classList.remove("open");
    drawer.classList.toggle("open");
  });

  // ESC 키로 드로어 닫기
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && drawer.classList.contains("open")) {
      drawer.classList.remove("open");
    }
  });

  document.body.appendChild(drawer);

  let leaderboard = new LeaderboardList();
  let leaderboardFetched = false;

  function showLeaderboard(lb: [string, number, string][]) {
    const list = leaderboardList;
    const scores = lb;
    list.innerHTML = ""; // 기존 내용 지우기

    console.log("Showing leaderboard:", scores);
    if (scores.length === 0) {
      const noDataItem = document.createElement("div");
      noDataItem.innerText = "저장된 점수가 없습니다.";
      noDataItem.style.textAlign = "center";
      list.appendChild(noDataItem);
      return;
    }

    scores.forEach(([name, score, additionalData], index) => {
      const listItem = document.createElement("div");
      const idnx = document.createElement("div");
      const nm = document.createElement("div");
      const scr = document.createElement("div");
      listItem.style.display = "flex";
      listItem.style.padding = "8px 0px";
      listItem.style.borderBottom = "1px solid #eee";
      if (index == scores.length - 1) {
        listItem.style.borderBottom = "none";
      }
      idnx.style.width = "2rem";
      idnx.style.marginRight = "10px";
      idnx.style.textAlign = "right";
      nm.style.flex = "1";
      scr.style.textAlign = "right";
      scr.style.display = "flex";
      scr.style.justifyContent = "flex-end";
      scr.style.alignItems = "flex-end";
      listItem.appendChild(idnx);
      listItem.appendChild(nm);
      listItem.appendChild(scr);
      idnx.innerText = `${index + 1}.`;
      nm.innerText = name;

      const scrSpan = document.createElement("span");
      const scrSpan2 = document.createElement("span");
      scrSpan.innerText = `${Math.floor(score)}점`;
      scrSpan2.style.color = "#888888a0";
      scrSpan2.style.fontSize = "0.8em";
      scrSpan2.style.fontWeight = "normal";
      scrSpan2.style.marginLeft = "4px";
      scrSpan2.innerText = `(${additionalData})`;
      scr.appendChild(scrSpan);
      scr.appendChild(scrSpan2);

      list.appendChild(listItem);

      if (index <= 2) {
        idnx.style.fontWeight = "bold";
        nm.style.fontWeight = "bold";
        scr.style.fontWeight = "bold";
      }

      if (index === 0) {
        idnx.innerText = "🥇";
        nm.style.color = "#ffb400";
        scr.style.color = "#ffb400";
      } else if (index === 1) {
        idnx.innerText = "🥈";
        nm.style.color = "#c0c0c0";
        scr.style.color = "#c0c0c0";
      } else if (index === 2) {
        idnx.innerText = "🥉";
        nm.style.color = "#cd7f32";
        scr.style.color = "#cd7f32";
      }
    });
  }
  async function fetchLeaderboard() {
    props.notifier.show("리더보드 불러오는중...");
    const lbData = await kv.get("lb");

    leaderboard.deserialize(lbData);
    console.log("Fetched leaderboard:", leaderboard.getList());
    showLeaderboard(leaderboard.getList());
  }
  async function saveScore(
    name: string,
    score: number,
    additionalData: string
  ) {
    props.notifier.show("점수 저장중...");
    if (!leaderboardFetched) {
      await fetchLeaderboard();
      leaderboardFetched = true;
    }

    console.log("OLD LB", leaderboard.getList());
    const added = leaderboard.add(name, score, additionalData);
    console.log("NEW LB", leaderboard.getList());
    if (!added) {
      // props.notifier.show("점수가 리더보드에 들지 못했습니다.");
      console.log("Score not high enough to enter leaderboard.");
      return;
    }

    await kv.set("lb", leaderboard.serialize());
    props.notifier.show("점수 저장 완료!");
    console.log("Saved score. New leaderboard:", leaderboard.getList());
    showLeaderboard(leaderboard.getList());
  }

  fetchLeaderboard().then(() => (leaderboardFetched = true));

  return {
    saveScore,
    showLeaderboard,
    fetchLeaderboard,
    leaderboardList,
    leaderboard,
  };
}

export default Leaderboard;
