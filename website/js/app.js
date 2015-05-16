function updateToGo() {
    Array.prototype.slice.call(document.querySelectorAll("#eventlist li.upcoming time")).forEach(function(t) {
        var togo = moment(t.getAttribute("datetime")).from();
        var span = t.querySelector("span.togo");
        if (!span) {
            span = document.createElement("span");
            span.className = "togo";
            span.appendChild(document.createTextNode(" "));
            t.appendChild(span);
        }
        span.firstChild.nodeValue = " (" + togo.toString() + ")";
    });
}

document.addEventListener("DOMContentLoaded", function() {
    updateToGo();
});

document.addEventListener("click", function(e) {
    if (e.target.nodeName.toLowerCase() == "a" && e.target.className == "loc") {
        e.preventDefault();
        var ifrs = e.target.parentNode.getElementsByTagName("iframe");
        if (ifrs.length > 0) {
            ifrs[0].parentNode.removeChild(ifrs[0]);
            return;
        }
        var ifr = document.createElement("iframe");
        ifr.className = "map";
        ifr.src = e.target.href.replace("google.com/maps?q", "google.com/maps/embed/v1/place?key=AIzaSyDGmKkBfxNrIqWZ3WNpZznrdMqHD9yV2fM&q");
        e.target.parentNode.insertBefore(ifr, e.target);
    }
});

setInterval(updateToGo, 60000);